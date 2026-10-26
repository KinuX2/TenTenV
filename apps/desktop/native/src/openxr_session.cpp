// TenTenV desktop — OpenXR backend (D3D11 graphics binding)
//
// ページ（three.js の WebGL）は Chromium の中で描くので、こちらは独自の D3D11 デバイスを作り、
// 読み戻した RGBA ピクセルをステージングテクスチャ → スワップチェーン画像へコピーして提出する。
//   - 基準空間は STAGE（無ければ LOCAL_FLOOR_EXT、さらに無ければ LOCAL）。WebXR の local / local-floor は
//     JS 側で「VR に入ったときの立ち位置と向き」から作る
//   - 入力は 1 つのアクションセットに Touch / Index / Vive / WMR / simple の推奨バインドを入れる
//   - XR_EXT_hand_tracking があれば両手の関節を毎フレーム取る
//   - XR_FB_display_refresh_rate があればリフレッシュレートの一覧と変更に対応する
//   - SteamVR などはフレーム提出の中でこちらの D3D11 の即時コンテキストを使うので、マルチスレッド保護を有効にする

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <d3d11_4.h>
#include <dxgi1_2.h>

#define XR_USE_PLATFORM_WIN32
#define XR_USE_GRAPHICS_API_D3D11
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <thread>

#include "session.h"

namespace tentenv {
namespace {

std::string ResultString(XrInstance instance, XrResult r) {
  char buf[XR_MAX_RESULT_STRING_SIZE] = {};
  if (instance != XR_NULL_HANDLE && XR_SUCCEEDED(xrResultToString(instance, r, buf))) return buf;
  return "XrResult(" + std::to_string(static_cast<int>(r)) + ")";
}

const char* StateName(XrSessionState s) {
  switch (s) {
    case XR_SESSION_STATE_IDLE: return "idle";
    case XR_SESSION_STATE_READY: return "ready";
    case XR_SESSION_STATE_SYNCHRONIZED: return "synchronized";
    case XR_SESSION_STATE_VISIBLE: return "visible";
    case XR_SESSION_STATE_FOCUSED: return "focused";
    case XR_SESSION_STATE_STOPPING: return "stopping";
    case XR_SESSION_STATE_LOSS_PENDING: return "loss_pending";
    case XR_SESSION_STATE_EXITING: return "exiting";
    default: return "unknown";
  }
}

template <typename T>
void SafeRelease(T*& p) {
  if (p) {
    p->Release();
    p = nullptr;
  }
}

Posef ToPose(const XrPosef& x) {
  Posef p;
  p.p[0] = x.position.x;
  p.p[1] = x.position.y;
  p.p[2] = x.position.z;
  p.q[0] = x.orientation.x;
  p.q[1] = x.orientation.y;
  p.q[2] = x.orientation.z;
  p.q[3] = x.orientation.w;
  return p;
}

XrPosef FromPose(const Posef& p) {
  XrPosef x{};
  x.position = {p.p[0], p.p[1], p.p[2]};
  x.orientation = {p.q[0], p.q[1], p.q[2], p.q[3]};
  return x;
}

struct EyeSwapchain {
  XrSwapchain handle = XR_NULL_HANDLE;
  std::vector<XrSwapchainImageD3D11KHR> images;
  ID3D11Texture2D* staging[2] = {nullptr, nullptr};
};

struct HandActions {
  XrPath path = XR_NULL_PATH;
  XrSpace grip = XR_NULL_HANDLE;
  XrSpace aim = XR_NULL_HANDLE;
  XrHandTrackerEXT tracker = XR_NULL_HANDLE;
  std::string profile;
};

class OpenXrSession final : public SessionBase {
 public:
  OpenXrSession(const std::string& appName, double scale) {
    try {
      InitInstance(appName);
      InitDevice();
      InitSession();
      InitSpaces();
      InitSwapchains(scale);
      InitActions();
      InitHandTracking();
      InitRefreshRate();
    } catch (...) {
      Shutdown();
      throw;
    }
  }
  ~OpenXrSession() override { Shutdown(); }

  // ------------------------------------------------------------------ フレーム

  std::vector<Event> PollEvents() override {
    std::vector<Event> out;
    if (!instance_) return out;
    if (exitQueued_) {
      exitQueued_ = false;
      out.push_back({"exit", "requested"});
    }
    for (;;) {
      XrEventDataBuffer ev{XR_TYPE_EVENT_DATA_BUFFER};
      if (xrPollEvent(instance_, &ev) != XR_SUCCESS) break;
      switch (ev.type) {
        case XR_TYPE_EVENT_DATA_SESSION_STATE_CHANGED: {
          auto* sc = reinterpret_cast<XrEventDataSessionStateChanged*>(&ev);
          state_ = sc->state;
          out.push_back({"state", StateName(state_)});
          if (state_ == XR_SESSION_STATE_READY) {
            XrSessionBeginInfo bi{XR_TYPE_SESSION_BEGIN_INFO};
            bi.primaryViewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
            XrResult r = xrBeginSession(session_, &bi);
            running_ = XR_SUCCEEDED(r);
            if (running_) out.push_back({"begin", ""});
            else out.push_back({"error", "xrBeginSession -> " + ResultString(instance_, r)});
          } else if (state_ == XR_SESSION_STATE_STOPPING) {
            xrEndSession(session_);
            running_ = false;
            out.push_back({"end", ""});
          } else if (state_ == XR_SESSION_STATE_EXITING || state_ == XR_SESSION_STATE_LOSS_PENDING) {
            out.push_back({"exit", StateName(state_)});
          } else if (state_ == XR_SESSION_STATE_FOCUSED) {
            RefreshProfiles();
          }
          break;
        }
        case XR_TYPE_EVENT_DATA_INSTANCE_LOSS_PENDING:
          out.push_back({"exit", "instance_loss_pending"});
          break;
        case XR_TYPE_EVENT_DATA_INTERACTION_PROFILE_CHANGED:
          RefreshProfiles();
          out.push_back({"profiles", ""});
          break;
        case XR_TYPE_EVENT_DATA_REFERENCE_SPACE_CHANGE_PENDING:
          out.push_back({"reset", ""});
          break;
        case XR_TYPE_EVENT_DATA_DISPLAY_REFRESH_RATE_CHANGED_FB: {
          auto* rc = reinterpret_cast<XrEventDataDisplayRefreshRateChangedFB*>(&ev);
          Event e{"refreshrate", ""};
          e.value = rc->toDisplayRefreshRate;
          out.push_back(e);
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  bool Running() const override { return running_; }

  void WaitFrame(FrameTiming& out) override {
    XrFrameWaitInfo wi{XR_TYPE_FRAME_WAIT_INFO};
    XrFrameState fs{XR_TYPE_FRAME_STATE};
    XrResult r = xrWaitFrame(session_, &wi, &fs);
    if (XR_FAILED(r)) throw std::runtime_error("xrWaitFrame -> " + ResultString(instance_, r));
    frameState_ = fs;
    out.shouldRender = fs.shouldRender == XR_TRUE;
    out.periodMs = static_cast<double>(fs.predictedDisplayPeriod) / 1e6;
    out.displayTimeMs = static_cast<double>(fs.predictedDisplayTime) / 1e6;
  }

  void BeginFrame() override {
    XrFrameBeginInfo bi{XR_TYPE_FRAME_BEGIN_INFO};
    XrResult r = xrBeginFrame(session_, &bi);
    if (XR_FAILED(r)) throw std::runtime_error("xrBeginFrame -> " + ResultString(instance_, r));
  }

  ViewsResult LocateViews() override {
    ViewsResult out;
    XrViewLocateInfo li{XR_TYPE_VIEW_LOCATE_INFO};
    li.viewConfigurationType = XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO;
    li.displayTime = frameState_.predictedDisplayTime;
    li.space = appSpace_;
    XrViewState vs{XR_TYPE_VIEW_STATE};
    XrView views[2] = {{XR_TYPE_VIEW}, {XR_TYPE_VIEW}};
    uint32_t count = 0;
    XrResult r = xrLocateViews(session_, &li, &vs, 2, &count, views);
    if (XR_FAILED(r)) throw std::runtime_error("xrLocateViews -> " + ResultString(instance_, r));
    out.valid = count == 2 && (vs.viewStateFlags & XR_VIEW_STATE_POSITION_VALID_BIT) &&
                (vs.viewStateFlags & XR_VIEW_STATE_ORIENTATION_VALID_BIT);
    out.positionTracked = (vs.viewStateFlags & XR_VIEW_STATE_POSITION_TRACKED_BIT) != 0;
    for (int i = 0; i < 2; ++i) {
      out.views[i].pose = ToPose(views[i].pose);
      out.views[i].fov[0] = views[i].fov.angleLeft;
      out.views[i].fov[1] = views[i].fov.angleRight;
      out.views[i].fov[2] = views[i].fov.angleUp;
      out.views[i].fov[3] = views[i].fov.angleDown;
    }
    out.seq = ++locateSeq_;
    viewRing_[out.seq % kViewRing][0] = out.views[0];
    viewRing_[out.seq % kViewRing][1] = out.views[1];
    return out;
  }

  void SyncInput(HandState out[2]) override {
    const bool focused = state_ == XR_SESSION_STATE_FOCUSED;
    if (focused) {
      XrActiveActionSet active{actionSet_, XR_NULL_PATH};
      XrActionsSyncInfo si{XR_TYPE_ACTIONS_SYNC_INFO};
      si.countActiveActionSets = 1;
      si.activeActionSets = &active;
      xrSyncActions(session_, &si);
    }
    const XrTime t = frameState_.predictedDisplayTime;
    for (int i = 0; i < 2; ++i) {
      HandState& h = out[i];
      h = HandState{};
      const XrPath sub = hands_[i].path;
      auto getFloat = [&](XrAction a) -> float {
        XrActionStateGetInfo gi{XR_TYPE_ACTION_STATE_GET_INFO};
        gi.action = a;
        gi.subactionPath = sub;
        XrActionStateFloat s{XR_TYPE_ACTION_STATE_FLOAT};
        if (!focused || XR_FAILED(xrGetActionStateFloat(session_, &gi, &s)) || !s.isActive) return 0.0f;
        return s.currentState;
      };
      auto getBool = [&](XrAction a) -> bool {
        XrActionStateGetInfo gi{XR_TYPE_ACTION_STATE_GET_INFO};
        gi.action = a;
        gi.subactionPath = sub;
        XrActionStateBoolean s{XR_TYPE_ACTION_STATE_BOOLEAN};
        if (!focused || XR_FAILED(xrGetActionStateBoolean(session_, &gi, &s)) || !s.isActive) return false;
        return s.currentState == XR_TRUE;
      };
      auto getVec2 = [&](XrAction a, float v[2]) -> bool {
        XrActionStateGetInfo gi{XR_TYPE_ACTION_STATE_GET_INFO};
        gi.action = a;
        gi.subactionPath = sub;
        XrActionStateVector2f s{XR_TYPE_ACTION_STATE_VECTOR2F};
        if (!focused || XR_FAILED(xrGetActionStateVector2f(session_, &gi, &s)) || !s.isActive) return false;
        v[0] = s.currentState.x;
        v[1] = s.currentState.y;
        return true;
      };
      auto locate = [&](XrSpace space, Posef& pose) -> bool {
        XrSpaceLocation loc{XR_TYPE_SPACE_LOCATION};
        if (XR_FAILED(xrLocateSpace(space, appSpace_, t, &loc))) return false;
        const bool ok = (loc.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) &&
                        (loc.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT);
        if (ok) pose = ToPose(loc.pose);
        return ok;
      };

      h.profile = hands_[i].profile;
      h.gripValid = locate(hands_[i].grip, h.grip);
      h.aimValid = locate(hands_[i].aim, h.aim);
      h.trigger = getFloat(trigger_);
      h.squeeze = getFloat(squeeze_);
      h.hasStick = getVec2(thumbstick_, h.stick);
      h.hasPad = getVec2(trackpad_, h.pad);
      h.triggerTouch = getBool(triggerTouch_);
      h.stickClick = getBool(thumbstickClick_);
      h.stickTouch = getBool(thumbstickTouch_);
      h.padClick = getBool(trackpadClick_);
      h.padTouch = getBool(trackpadTouch_);
      h.primary = getBool(primary_);
      h.primaryTouch = getBool(primaryTouch_);
      h.secondary = getBool(secondary_);
      h.secondaryTouch = getBool(secondaryTouch_);
      h.menu = getBool(menu_);
      h.controllerActive = (h.gripValid || h.aimValid) && !h.profile.empty();

      if (hands_[i].tracker && xrLocateHandJointsEXT_) {
        XrHandJointLocationEXT joints[XR_HAND_JOINT_COUNT_EXT];
        XrHandJointLocationsEXT locs{XR_TYPE_HAND_JOINT_LOCATIONS_EXT};
        locs.jointCount = XR_HAND_JOINT_COUNT_EXT;
        locs.jointLocations = joints;
        XrHandJointsLocateInfoEXT li{XR_TYPE_HAND_JOINTS_LOCATE_INFO_EXT};
        li.baseSpace = appSpace_;
        li.time = t;
        if (XR_SUCCEEDED(xrLocateHandJointsEXT_(hands_[i].tracker, &li, &locs)) && locs.isActive) {
          h.jointsValid = true;
          // OpenXR: 0=palm, 1=wrist, 2..25 = 指（WebXR と同じ順）→ WebXR の 0..24 と、末尾に palm
          for (int j = 0; j < kJointCount; ++j) {
            const XrHandJointLocationEXT& src = joints[j == kJointCount - 1 ? 0 : j + 1];
            float* dst = h.joints + j * kJointStride;
            const bool ok = (src.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) &&
                            (src.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT);
            dst[0] = src.pose.position.x;
            dst[1] = src.pose.position.y;
            dst[2] = src.pose.position.z;
            dst[3] = src.pose.orientation.x;
            dst[4] = src.pose.orientation.y;
            dst[5] = src.pose.orientation.z;
            dst[6] = src.pose.orientation.w;
            dst[7] = ok ? src.radius : -1.0f;
          }
        }
      }
    }
  }

  void CopyPixels(int slot, const uint8_t* data, const size_t offs[2], uint32_t pitch) override {
    auto t0 = std::chrono::steady_clock::now();
    D3D11_MAPPED_SUBRESOURCE mapped[2] = {};
    for (int eye = 0; eye < 2; ++eye) {
      HRESULT hr = context_->Map(eyes_[eye].staging[slot], 0, D3D11_MAP_WRITE, 0, &mapped[eye]);
      if (FAILED(hr)) {
        if (eye == 1) context_->Unmap(eyes_[0].staging[slot], 0);
        throw std::runtime_error("ID3D11DeviceContext::Map(staging) failed");
      }
    }
    const size_t row = static_cast<size_t>(info_.width) * 4;
    auto copyEye = [&](int eye) {
      const uint8_t* src = data + offs[eye];
      auto* dst = static_cast<uint8_t*>(mapped[eye].pData);
      for (int y = 0; y < info_.height; ++y) {
        memcpy(dst + static_cast<size_t>(y) * mapped[eye].RowPitch, src + static_cast<size_t>(y) * pitch, row);
      }
    };
    std::thread other(copyEye, 1);
    copyEye(0);
    other.join();
    for (int eye = 0; eye < 2; ++eye) context_->Unmap(eyes_[eye].staging[slot], 0);
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
    SamplePixels(data, offs, pitch, ms);
  }

  void CommitPixels(int slot, uint64_t seq) override {
    for (int eye = 0; eye < 2; ++eye) {
      auto& sc = eyes_[eye];
      uint32_t index = 0;
      XrSwapchainImageAcquireInfo ai{XR_TYPE_SWAPCHAIN_IMAGE_ACQUIRE_INFO};
      XrResult r = xrAcquireSwapchainImage(sc.handle, &ai, &index);
      if (XR_FAILED(r)) throw std::runtime_error("xrAcquireSwapchainImage -> " + ResultString(instance_, r));
      XrSwapchainImageWaitInfo wi{XR_TYPE_SWAPCHAIN_IMAGE_WAIT_INFO};
      wi.timeout = XR_INFINITE_DURATION;
      r = xrWaitSwapchainImage(sc.handle, &wi);
      if (XR_FAILED(r)) throw std::runtime_error("xrWaitSwapchainImage -> " + ResultString(instance_, r));
      context_->CopyResource(sc.images[index].texture, sc.staging[slot]);
      XrSwapchainImageReleaseInfo ri{XR_TYPE_SWAPCHAIN_IMAGE_RELEASE_INFO};
      r = xrReleaseSwapchainImage(sc.handle, &ri);
      if (XR_FAILED(r)) throw std::runtime_error("xrReleaseSwapchainImage -> " + ResultString(instance_, r));
    }
    context_->Flush();
    submittedViews_[0] = viewRing_[seq % kViewRing][0];
    submittedViews_[1] = viewRing_[seq % kViewRing][1];
    hasImage_ = true;
    CountSubmit();
  }

  bool EndFrame() override {
    XrCompositionLayerProjectionView pv[2] = {{XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW},
                                              {XR_TYPE_COMPOSITION_LAYER_PROJECTION_VIEW}};
    XrCompositionLayerProjection layer{XR_TYPE_COMPOSITION_LAYER_PROJECTION};
    const XrCompositionLayerBaseHeader* layers[1] = {reinterpret_cast<XrCompositionLayerBaseHeader*>(&layer)};
    // 最後に書き込んだ画像を、それを描いたときの姿勢で出す（コンポジタが今の頭の向きへ再投影する）
    const bool submit = hasImage_;
    if (submit) {
      for (int i = 0; i < 2; ++i) {
        pv[i].pose = FromPose(submittedViews_[i].pose);
        pv[i].fov = {submittedViews_[i].fov[0], submittedViews_[i].fov[1], submittedViews_[i].fov[2], submittedViews_[i].fov[3]};
        pv[i].subImage.swapchain = eyes_[i].handle;
        pv[i].subImage.imageRect.offset = {0, 0};
        pv[i].subImage.imageRect.extent = {info_.width, info_.height};
        pv[i].subImage.imageArrayIndex = 0;
      }
      layer.space = appSpace_;
      layer.viewCount = 2;
      layer.views = pv;
    }
    XrFrameEndInfo ei{XR_TYPE_FRAME_END_INFO};
    ei.displayTime = frameState_.predictedDisplayTime;
    ei.environmentBlendMode = XR_ENVIRONMENT_BLEND_MODE_OPAQUE;
    ei.layerCount = submit ? 1 : 0;
    ei.layers = submit ? layers : nullptr;
    XrResult r = xrEndFrame(session_, &ei);
    if (XR_FAILED(r)) throw std::runtime_error("xrEndFrame -> " + ResultString(instance_, r));
    CountFrame(submit);
    return submit;
  }

  void Haptics(int hand, float amplitude, double durationMs, float frequency) override {
    if (hand < 0 || hand > 1 || !session_) return;
    XrHapticVibration vib{XR_TYPE_HAPTIC_VIBRATION};
    vib.amplitude = std::clamp(amplitude, 0.0f, 1.0f);
    vib.duration = static_cast<XrDuration>(std::max(0.0, durationMs) * 1e6);
    vib.frequency = frequency > 0 ? frequency : XR_FREQUENCY_UNSPECIFIED;
    XrHapticActionInfo hi{XR_TYPE_HAPTIC_ACTION_INFO};
    hi.action = haptic_;
    hi.subactionPath = hands_[hand].path;
    xrApplyHapticFeedback(session_, &hi, reinterpret_cast<XrHapticBaseHeader*>(&vib));
    CountHaptics();
  }

  void StopHaptics(int hand) override {
    if (hand < 0 || hand > 1 || !session_) return;
    XrHapticActionInfo hi{XR_TYPE_HAPTIC_ACTION_INFO};
    hi.action = haptic_;
    hi.subactionPath = hands_[hand].path;
    xrStopHapticFeedback(session_, &hi);
  }

  void RequestExit() override {
    if (!session_) return;
    if (running_) {
      if (XR_FAILED(xrRequestExitSession(session_))) exitQueued_ = true;
    } else {
      // まだ始まっていない（READY 前）なら、そのまま終わったことにする
      exitQueued_ = true;
    }
  }

  bool Bounds(float& width, float& depth) override {
    if (!session_ || info_.space != "stage") return false;
    XrExtent2Df ext{};
    XrResult r = xrGetReferenceSpaceBoundsRect(session_, XR_REFERENCE_SPACE_TYPE_STAGE, &ext);
    if (r != XR_SUCCESS || ext.width <= 0 || ext.height <= 0) return false;
    width = ext.width;
    depth = ext.height;
    return true;
  }

  std::vector<float> RefreshRates() override {
    std::vector<float> rates;
    if (!xrEnumerateDisplayRefreshRatesFB_ || !session_) return rates;
    uint32_t n = 0;
    if (XR_FAILED(xrEnumerateDisplayRefreshRatesFB_(session_, 0, &n, nullptr)) || n == 0) return rates;
    rates.resize(n);
    if (XR_FAILED(xrEnumerateDisplayRefreshRatesFB_(session_, n, &n, rates.data()))) rates.clear();
    return rates;
  }

  float RefreshRate() override {
    float hz = 0;
    if (xrGetDisplayRefreshRateFB_ && session_) xrGetDisplayRefreshRateFB_(session_, &hz);
    return hz;
  }

  bool SetRefreshRate(float hz) override {
    if (!xrRequestDisplayRefreshRateFB_ || !session_) return false;
    return XR_SUCCEEDED(xrRequestDisplayRefreshRateFB_(session_, hz));
  }

  void Shutdown() override {
    for (auto& sp : trackerSpaces_) {
      if (sp) xrDestroySpace(sp);
      sp = XR_NULL_HANDLE;
    }
    for (auto& h : hands_) {
      if (h.tracker && xrDestroyHandTrackerEXT_) xrDestroyHandTrackerEXT_(h.tracker);
      if (h.grip) xrDestroySpace(h.grip);
      if (h.aim) xrDestroySpace(h.aim);
      h.tracker = XR_NULL_HANDLE;
      h.grip = h.aim = XR_NULL_HANDLE;
    }
    if (actionSet_) xrDestroyActionSet(actionSet_);
    actionSet_ = XR_NULL_HANDLE;
    for (auto& e : eyes_) {
      for (auto& st : e.staging) SafeRelease(st);
      if (e.handle) xrDestroySwapchain(e.handle);
      e.handle = XR_NULL_HANDLE;
      e.images.clear();
    }
    if (appSpace_) xrDestroySpace(appSpace_);
    appSpace_ = XR_NULL_HANDLE;
    if (session_) xrDestroySession(session_);
    session_ = XR_NULL_HANDLE;
    if (instance_) xrDestroyInstance(instance_);
    instance_ = XR_NULL_HANDLE;
    SafeRelease(context_);
    SafeRelease(device_);
    running_ = false;
  }

 private:
  void Check(XrResult r, const char* what) {
    if (XR_FAILED(r)) throw std::runtime_error(std::string(what) + " -> " + ResultString(instance_, r));
  }

  template <typename Fn>
  void Proc(const char* name, Fn& fn) {
    if (XR_FAILED(xrGetInstanceProcAddr(instance_, name, reinterpret_cast<PFN_xrVoidFunction*>(&fn)))) fn = nullptr;
  }

  // ------------------------------------------------------------------ 初期化

  void InitInstance(const std::string& appName) {
    uint32_t n = 0;
    Check(xrEnumerateInstanceExtensionProperties(nullptr, 0, &n, nullptr), "xrEnumerateInstanceExtensionProperties");
    std::vector<XrExtensionProperties> exts(n, {XR_TYPE_EXTENSION_PROPERTIES});
    Check(xrEnumerateInstanceExtensionProperties(nullptr, n, &n, exts.data()), "xrEnumerateInstanceExtensionProperties");
    auto has = [&](const char* name) {
      return std::any_of(exts.begin(), exts.end(), [&](const XrExtensionProperties& e) { return strcmp(e.extensionName, name) == 0; });
    };
    if (!has(XR_KHR_D3D11_ENABLE_EXTENSION_NAME)) throw std::runtime_error("OpenXR runtime does not support XR_KHR_D3D11_enable");
    std::vector<const char*> enabled = {XR_KHR_D3D11_ENABLE_EXTENSION_NAME};
    hasLocalFloor_ = has(XR_EXT_LOCAL_FLOOR_EXTENSION_NAME);
    hasHandTracking_ = has(XR_EXT_HAND_TRACKING_EXTENSION_NAME);
    hasRefreshRate_ = has(XR_FB_DISPLAY_REFRESH_RATE_EXTENSION_NAME);
    hasTouchPlus_ = has(XR_META_TOUCH_CONTROLLER_PLUS_EXTENSION_NAME);
    hasViveTracker_ = has(XR_HTCX_VIVE_TRACKER_INTERACTION_EXTENSION_NAME);
    if (hasLocalFloor_) enabled.push_back(XR_EXT_LOCAL_FLOOR_EXTENSION_NAME);
    if (hasHandTracking_) enabled.push_back(XR_EXT_HAND_TRACKING_EXTENSION_NAME);
    if (hasRefreshRate_) enabled.push_back(XR_FB_DISPLAY_REFRESH_RATE_EXTENSION_NAME);
    if (hasTouchPlus_) enabled.push_back(XR_META_TOUCH_CONTROLLER_PLUS_EXTENSION_NAME);
    if (hasViveTracker_) enabled.push_back(XR_HTCX_VIVE_TRACKER_INTERACTION_EXTENSION_NAME);

    XrInstanceCreateInfo ci{XR_TYPE_INSTANCE_CREATE_INFO};
    strncpy_s(ci.applicationInfo.applicationName, appName.c_str(), XR_MAX_APPLICATION_NAME_SIZE - 1);
    ci.applicationInfo.applicationVersion = 1;
    strncpy_s(ci.applicationInfo.engineName, "TenTenV WebXR bridge", XR_MAX_ENGINE_NAME_SIZE - 1);
    ci.applicationInfo.engineVersion = 1;
    ci.applicationInfo.apiVersion = XR_API_VERSION_1_0;
    ci.enabledExtensionCount = static_cast<uint32_t>(enabled.size());
    ci.enabledExtensionNames = enabled.data();
    Check(xrCreateInstance(&ci, &instance_), "xrCreateInstance");

    XrInstanceProperties ip{XR_TYPE_INSTANCE_PROPERTIES};
    Check(xrGetInstanceProperties(instance_, &ip), "xrGetInstanceProperties");
    info_.backend = "openxr";
    info_.runtimeName = ip.runtimeName;

    XrSystemGetInfo sgi{XR_TYPE_SYSTEM_GET_INFO};
    sgi.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
    Check(xrGetSystem(instance_, &sgi, &systemId_), "xrGetSystem (is the headset connected and the runtime running?)");

    XrSystemHandTrackingPropertiesEXT ht{XR_TYPE_SYSTEM_HAND_TRACKING_PROPERTIES_EXT};
    XrSystemProperties sp{XR_TYPE_SYSTEM_PROPERTIES};
    if (hasHandTracking_) sp.next = &ht;
    Check(xrGetSystemProperties(instance_, systemId_, &sp), "xrGetSystemProperties");
    info_.systemName = sp.systemName;
    hasHandTracking_ = hasHandTracking_ && ht.supportsHandTracking == XR_TRUE;
  }

  void InitDevice() {
    PFN_xrGetD3D11GraphicsRequirementsKHR getReq = nullptr;
    Proc("xrGetD3D11GraphicsRequirementsKHR", getReq);
    if (!getReq) throw std::runtime_error("xrGetD3D11GraphicsRequirementsKHR not available");
    XrGraphicsRequirementsD3D11KHR req{XR_TYPE_GRAPHICS_REQUIREMENTS_D3D11_KHR};
    Check(getReq(instance_, systemId_, &req), "xrGetD3D11GraphicsRequirementsKHR");

    IDXGIFactory1* factory = nullptr;
    if (FAILED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(&factory)))) {
      throw std::runtime_error("CreateDXGIFactory1 failed");
    }
    IDXGIAdapter1* adapter = nullptr;
    for (UINT i = 0;; ++i) {
      IDXGIAdapter1* a = nullptr;
      if (factory->EnumAdapters1(i, &a) == DXGI_ERROR_NOT_FOUND) break;
      DXGI_ADAPTER_DESC1 desc;
      a->GetDesc1(&desc);
      if (memcmp(&desc.AdapterLuid, &req.adapterLuid, sizeof(LUID)) == 0) {
        adapter = a;
        char name[256] = {};
        WideCharToMultiByte(CP_UTF8, 0, desc.Description, -1, name, sizeof(name) - 1, nullptr, nullptr);
        info_.adapterName = name;
        break;
      }
      a->Release();
    }
    factory->Release();

    const D3D_FEATURE_LEVEL all[] = {D3D_FEATURE_LEVEL_12_1, D3D_FEATURE_LEVEL_12_0, D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0};
    std::vector<D3D_FEATURE_LEVEL> levels;
    for (auto l : all) {
      if (l >= req.minFeatureLevel) levels.push_back(l);
    }
    if (levels.empty()) levels.push_back(D3D_FEATURE_LEVEL_11_0);
    HRESULT hr = D3D11CreateDevice(adapter, adapter ? D3D_DRIVER_TYPE_UNKNOWN : D3D_DRIVER_TYPE_HARDWARE, nullptr,
                                   D3D11_CREATE_DEVICE_BGRA_SUPPORT, levels.data(), static_cast<UINT>(levels.size()),
                                   D3D11_SDK_VERSION, &device_, nullptr, &context_);
    SafeRelease(adapter);
    if (FAILED(hr)) throw std::runtime_error("D3D11CreateDevice failed");
    ID3D11Multithread* mt = nullptr;
    if (SUCCEEDED(context_->QueryInterface(__uuidof(ID3D11Multithread), reinterpret_cast<void**>(&mt)))) {
      mt->SetMultithreadProtected(TRUE);
      mt->Release();
    }
  }

  void InitSession() {
    XrGraphicsBindingD3D11KHR binding{XR_TYPE_GRAPHICS_BINDING_D3D11_KHR};
    binding.device = device_;
    XrSessionCreateInfo ci{XR_TYPE_SESSION_CREATE_INFO};
    ci.next = &binding;
    ci.systemId = systemId_;
    Check(xrCreateSession(instance_, &ci, &session_), "xrCreateSession");
  }

  void InitSpaces() {
    uint32_t n = 0;
    Check(xrEnumerateReferenceSpaces(session_, 0, &n, nullptr), "xrEnumerateReferenceSpaces");
    std::vector<XrReferenceSpaceType> types(n);
    Check(xrEnumerateReferenceSpaces(session_, n, &n, types.data()), "xrEnumerateReferenceSpaces");
    auto has = [&](XrReferenceSpaceType t) { return std::find(types.begin(), types.end(), t) != types.end(); };

    XrReferenceSpaceCreateInfo ci{XR_TYPE_REFERENCE_SPACE_CREATE_INFO};
    ci.poseInReferenceSpace.orientation.w = 1.0f;
    const struct {
      XrReferenceSpaceType type;
      const char* name;
      bool allowed;
    } order[] = {
        {XR_REFERENCE_SPACE_TYPE_STAGE, "stage", has(XR_REFERENCE_SPACE_TYPE_STAGE)},
        {XR_REFERENCE_SPACE_TYPE_LOCAL_FLOOR_EXT, "local-floor", hasLocalFloor_ && has(XR_REFERENCE_SPACE_TYPE_LOCAL_FLOOR_EXT)},
        {XR_REFERENCE_SPACE_TYPE_LOCAL, "local", true},
    };
    for (const auto& o : order) {
      if (!o.allowed) continue;
      ci.referenceSpaceType = o.type;
      if (XR_SUCCEEDED(xrCreateReferenceSpace(session_, &ci, &appSpace_))) {
        info_.space = o.name;
        return;
      }
    }
    throw std::runtime_error("xrCreateReferenceSpace failed for stage / local-floor / local");
  }

  void InitSwapchains(double scale) {
    uint32_t n = 0;
    Check(xrEnumerateViewConfigurationViews(instance_, systemId_, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, 0, &n, nullptr),
          "xrEnumerateViewConfigurationViews");
    std::vector<XrViewConfigurationView> cfg(n, {XR_TYPE_VIEW_CONFIGURATION_VIEW});
    Check(xrEnumerateViewConfigurationViews(instance_, systemId_, XR_VIEW_CONFIGURATION_TYPE_PRIMARY_STEREO, n, &n, cfg.data()),
          "xrEnumerateViewConfigurationViews");
    if (n != 2) throw std::runtime_error("expected 2 stereo views");

    uint32_t fc = 0;
    Check(xrEnumerateSwapchainFormats(session_, 0, &fc, nullptr), "xrEnumerateSwapchainFormats");
    std::vector<int64_t> formats(fc);
    Check(xrEnumerateSwapchainFormats(session_, fc, &fc, formats.data()), "xrEnumerateSwapchainFormats");
    // ページの描画結果は sRGB エンコード済みの 8bit 値なので *_SRGB を優先（コンポジタがデコードする）
    const int64_t preferred[] = {DXGI_FORMAT_R8G8B8A8_UNORM_SRGB, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, DXGI_FORMAT_R8G8B8A8_UNORM,
                                 DXGI_FORMAT_B8G8R8A8_UNORM};
    int64_t format = 0;
    for (int64_t p : preferred) {
      if (std::find(formats.begin(), formats.end(), p) != formats.end()) {
        format = p;
        break;
      }
    }
    if (!format) throw std::runtime_error("no 8-bit RGBA/BGRA swapchain format available");
    info_.bgra = format == DXGI_FORMAT_B8G8R8A8_UNORM_SRGB || format == DXGI_FORMAT_B8G8R8A8_UNORM;
    info_.srgb = format == DXGI_FORMAT_R8G8B8A8_UNORM_SRGB || format == DXGI_FORMAT_B8G8R8A8_UNORM_SRGB;

    // 両眼同じ大きさ。幅は 64 の倍数（= 1 行 256 バイト境界。WebGPU の copyTextureToBuffer と相性が良い）
    int32_t w = 0, h = 0, maxW = INT32_MAX, maxH = INT32_MAX;
    for (auto& v : cfg) {
      info_.recommended.push_back({static_cast<int>(v.recommendedImageRectWidth), static_cast<int>(v.recommendedImageRectHeight)});
      w = std::max<int32_t>(w, static_cast<int32_t>(std::lround(v.recommendedImageRectWidth * scale)));
      h = std::max<int32_t>(h, static_cast<int32_t>(std::lround(v.recommendedImageRectHeight * scale)));
      maxW = std::min<int32_t>(maxW, static_cast<int32_t>(v.maxImageRectWidth));
      maxH = std::min<int32_t>(maxH, static_cast<int32_t>(v.maxImageRectHeight));
    }
    w = std::max<int32_t>(64, std::min(((w + 63) / 64) * 64, (maxW / 64) * 64));
    h = std::max<int32_t>(64, std::min(h, maxH));
    info_.width = w;
    info_.height = h;

    for (auto& sc : eyes_) {
      XrSwapchainCreateInfo ci{XR_TYPE_SWAPCHAIN_CREATE_INFO};
      ci.usageFlags = XR_SWAPCHAIN_USAGE_COLOR_ATTACHMENT_BIT | XR_SWAPCHAIN_USAGE_TRANSFER_DST_BIT;
      ci.format = format;
      ci.sampleCount = 1;
      ci.width = w;
      ci.height = h;
      ci.faceCount = 1;
      ci.arraySize = 1;
      ci.mipCount = 1;
      Check(xrCreateSwapchain(session_, &ci, &sc.handle), "xrCreateSwapchain");
      uint32_t ic = 0;
      Check(xrEnumerateSwapchainImages(sc.handle, 0, &ic, nullptr), "xrEnumerateSwapchainImages");
      sc.images.assign(ic, {XR_TYPE_SWAPCHAIN_IMAGE_D3D11_KHR});
      Check(xrEnumerateSwapchainImages(sc.handle, ic, &ic, reinterpret_cast<XrSwapchainImageBaseHeader*>(sc.images.data())),
            "xrEnumerateSwapchainImages");
      D3D11_TEXTURE2D_DESC td{};
      td.Width = w;
      td.Height = h;
      td.MipLevels = 1;
      td.ArraySize = 1;
      td.Format = static_cast<DXGI_FORMAT>(format);
      td.SampleDesc.Count = 1;
      td.Usage = D3D11_USAGE_STAGING;
      td.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
      for (auto& st : sc.staging) {
        if (FAILED(device_->CreateTexture2D(&td, nullptr, &st))) throw std::runtime_error("CreateTexture2D(staging) failed");
      }
    }
  }

  XrPath Path(const std::string& s) {
    XrPath p = XR_NULL_PATH;
    Check(xrStringToPath(instance_, s.c_str(), &p), s.c_str());
    return p;
  }

  XrAction MakeAction(const char* name, const char* localized, XrActionType type) {
    XrActionCreateInfo ci{XR_TYPE_ACTION_CREATE_INFO};
    strcpy_s(ci.actionName, name);
    strcpy_s(ci.localizedActionName, localized);
    ci.actionType = type;
    XrPath subs[2] = {hands_[0].path, hands_[1].path};
    ci.countSubactionPaths = 2;
    ci.subactionPaths = subs;
    XrAction a = XR_NULL_HANDLE;
    Check(xrCreateAction(actionSet_, &ci, &a), name);
    return a;
  }

  using Binding = std::pair<XrAction, std::string>;

  void Suggest(const char* profile, const std::vector<Binding>& bindings) {
    std::vector<XrActionSuggestedBinding> b;
    b.reserve(bindings.size());
    for (const auto& [action, path] : bindings) b.push_back({action, Path(path)});
    XrInteractionProfileSuggestedBinding s{XR_TYPE_INTERACTION_PROFILE_SUGGESTED_BINDING};
    s.interactionProfile = Path(profile);
    s.suggestedBindings = b.data();
    s.countSuggestedBindings = static_cast<uint32_t>(b.size());
    XrResult r = xrSuggestInteractionProfileBindings(instance_, &s);
    // 1 つのプロファイルが通らなくても他は使える
    if (XR_FAILED(r)) fprintf(stderr, "[tentenv-openxr] suggest bindings failed for %s: %s\n", profile, ResultString(instance_, r).c_str());
  }

  void InitActions() {
    XrActionSetCreateInfo asci{XR_TYPE_ACTION_SET_CREATE_INFO};
    strcpy_s(asci.actionSetName, "tentenv");
    strcpy_s(asci.localizedActionSetName, "TenTenV");
    Check(xrCreateActionSet(instance_, &asci, &actionSet_), "xrCreateActionSet");
    hands_[0].path = Path("/user/hand/left");
    hands_[1].path = Path("/user/hand/right");

    gripPose_ = MakeAction("grip_pose", "Grip pose", XR_ACTION_TYPE_POSE_INPUT);
    aimPose_ = MakeAction("aim_pose", "Aim pose", XR_ACTION_TYPE_POSE_INPUT);
    trigger_ = MakeAction("trigger", "Trigger", XR_ACTION_TYPE_FLOAT_INPUT);
    triggerTouch_ = MakeAction("trigger_touch", "Trigger touch", XR_ACTION_TYPE_BOOLEAN_INPUT);
    squeeze_ = MakeAction("squeeze", "Squeeze", XR_ACTION_TYPE_FLOAT_INPUT);
    thumbstick_ = MakeAction("thumbstick", "Thumbstick", XR_ACTION_TYPE_VECTOR2F_INPUT);
    thumbstickClick_ = MakeAction("thumbstick_click", "Thumbstick click", XR_ACTION_TYPE_BOOLEAN_INPUT);
    thumbstickTouch_ = MakeAction("thumbstick_touch", "Thumbstick touch", XR_ACTION_TYPE_BOOLEAN_INPUT);
    trackpad_ = MakeAction("trackpad", "Trackpad", XR_ACTION_TYPE_VECTOR2F_INPUT);
    trackpadClick_ = MakeAction("trackpad_click", "Trackpad click", XR_ACTION_TYPE_BOOLEAN_INPUT);
    trackpadTouch_ = MakeAction("trackpad_touch", "Trackpad touch", XR_ACTION_TYPE_BOOLEAN_INPUT);
    primary_ = MakeAction("primary_button", "A / X button", XR_ACTION_TYPE_BOOLEAN_INPUT);
    primaryTouch_ = MakeAction("primary_touch", "A / X touch", XR_ACTION_TYPE_BOOLEAN_INPUT);
    secondary_ = MakeAction("secondary_button", "B / Y button", XR_ACTION_TYPE_BOOLEAN_INPUT);
    secondaryTouch_ = MakeAction("secondary_touch", "B / Y touch", XR_ACTION_TYPE_BOOLEAN_INPUT);
    menu_ = MakeAction("menu", "Menu", XR_ACTION_TYPE_BOOLEAN_INPUT);
    haptic_ = MakeAction("haptic", "Haptic", XR_ACTION_TYPE_VIBRATION_OUTPUT);

    const std::string L = "/user/hand/left", R = "/user/hand/right";
    auto common = [&](std::vector<Binding>& v) {
      for (const auto& h : {L, R}) {
        v.push_back({gripPose_, h + "/input/grip/pose"});
        v.push_back({aimPose_, h + "/input/aim/pose"});
        v.push_back({haptic_, h + "/output/haptic"});
      }
    };
    {  // Khronos simple controller
      std::vector<Binding> v;
      common(v);
      for (const auto& h : {L, R}) {
        v.push_back({trigger_, h + "/input/select/click"});
        v.push_back({menu_, h + "/input/menu/click"});
      }
      Suggest("/interaction_profiles/khr/simple_controller", v);
    }
    auto touch = [&](const char* profile) {  // Oculus Touch / Meta Quest Touch Plus
      std::vector<Binding> v;
      common(v);
      for (const auto& h : {L, R}) {
        v.push_back({trigger_, h + "/input/trigger/value"});
        v.push_back({triggerTouch_, h + "/input/trigger/touch"});
        v.push_back({squeeze_, h + "/input/squeeze/value"});
        v.push_back({thumbstick_, h + "/input/thumbstick"});
        v.push_back({thumbstickClick_, h + "/input/thumbstick/click"});
        v.push_back({thumbstickTouch_, h + "/input/thumbstick/touch"});
      }
      v.push_back({primary_, L + "/input/x/click"});
      v.push_back({primaryTouch_, L + "/input/x/touch"});
      v.push_back({secondary_, L + "/input/y/click"});
      v.push_back({secondaryTouch_, L + "/input/y/touch"});
      v.push_back({menu_, L + "/input/menu/click"});
      v.push_back({primary_, R + "/input/a/click"});
      v.push_back({primaryTouch_, R + "/input/a/touch"});
      v.push_back({secondary_, R + "/input/b/click"});
      v.push_back({secondaryTouch_, R + "/input/b/touch"});
      Suggest(profile, v);
    };
    touch("/interaction_profiles/oculus/touch_controller");
    if (hasTouchPlus_) touch("/interaction_profiles/meta/touch_controller_plus");
    {  // Valve Index
      std::vector<Binding> v;
      common(v);
      for (const auto& h : {L, R}) {
        v.push_back({trigger_, h + "/input/trigger/value"});
        v.push_back({triggerTouch_, h + "/input/trigger/touch"});
        v.push_back({squeeze_, h + "/input/squeeze/value"});
        v.push_back({thumbstick_, h + "/input/thumbstick"});
        v.push_back({thumbstickClick_, h + "/input/thumbstick/click"});
        v.push_back({thumbstickTouch_, h + "/input/thumbstick/touch"});
        v.push_back({trackpad_, h + "/input/trackpad"});
        v.push_back({trackpadTouch_, h + "/input/trackpad/touch"});
        v.push_back({primary_, h + "/input/a/click"});
        v.push_back({primaryTouch_, h + "/input/a/touch"});
        v.push_back({secondary_, h + "/input/b/click"});
        v.push_back({secondaryTouch_, h + "/input/b/touch"});
      }
      Suggest("/interaction_profiles/valve/index_controller", v);
    }
    {  // HTC Vive
      std::vector<Binding> v;
      common(v);
      for (const auto& h : {L, R}) {
        v.push_back({trigger_, h + "/input/trigger/value"});
        v.push_back({squeeze_, h + "/input/squeeze/click"});
        v.push_back({trackpad_, h + "/input/trackpad"});
        v.push_back({trackpadClick_, h + "/input/trackpad/click"});
        v.push_back({trackpadTouch_, h + "/input/trackpad/touch"});
        v.push_back({menu_, h + "/input/menu/click"});
      }
      Suggest("/interaction_profiles/htc/vive_controller", v);
    }
    {  // Windows Mixed Reality
      std::vector<Binding> v;
      common(v);
      for (const auto& h : {L, R}) {
        v.push_back({trigger_, h + "/input/trigger/value"});
        v.push_back({squeeze_, h + "/input/squeeze/click"});
        v.push_back({thumbstick_, h + "/input/thumbstick"});
        v.push_back({thumbstickClick_, h + "/input/thumbstick/click"});
        v.push_back({trackpad_, h + "/input/trackpad"});
        v.push_back({trackpadClick_, h + "/input/trackpad/click"});
        v.push_back({trackpadTouch_, h + "/input/trackpad/touch"});
        v.push_back({menu_, h + "/input/menu/click"});
      }
      Suggest("/interaction_profiles/microsoft/motion_controller", v);
    }

    if (hasViveTracker_) InitTrackers();

    for (auto& hand : hands_) {
      XrActionSpaceCreateInfo sci{XR_TYPE_ACTION_SPACE_CREATE_INFO};
      sci.poseInActionSpace.orientation.w = 1.0f;
      sci.subactionPath = hand.path;
      sci.action = gripPose_;
      Check(xrCreateActionSpace(session_, &sci, &hand.grip), "xrCreateActionSpace(grip)");
      sci.action = aimPose_;
      Check(xrCreateActionSpace(session_, &sci, &hand.aim), "xrCreateActionSpace(aim)");
    }
    XrSessionActionSetsAttachInfo attach{XR_TYPE_SESSION_ACTION_SETS_ATTACH_INFO};
    attach.countActionSets = 1;
    attach.actionSets = &actionSet_;
    Check(xrAttachSessionActionSets(session_, &attach), "xrAttachSessionActionSets");
  }

  // 体のトラッカー（XR_HTCX_vive_tracker_interaction）。SteamVR で役割（腰・左足・右足）を割り当てたものを読む
  void InitTrackers() {
    static const char* roles[kTrackerCount] = {"/user/vive_tracker_htcx/role/waist", "/user/vive_tracker_htcx/role/left_foot",
                                               "/user/vive_tracker_htcx/role/right_foot"};
    XrPath subs[kTrackerCount];
    for (int i = 0; i < kTrackerCount; ++i) subs[i] = trackerPaths_[i] = Path(roles[i]);
    XrActionCreateInfo ci{XR_TYPE_ACTION_CREATE_INFO};
    strcpy_s(ci.actionName, "body_tracker_pose");
    strcpy_s(ci.localizedActionName, "Body tracker pose");
    ci.actionType = XR_ACTION_TYPE_POSE_INPUT;
    ci.countSubactionPaths = kTrackerCount;
    ci.subactionPaths = subs;
    if (XR_FAILED(xrCreateAction(actionSet_, &ci, &trackerPose_))) {
      trackerPose_ = XR_NULL_HANDLE;
      return;
    }
    std::vector<Binding> v;
    for (int i = 0; i < kTrackerCount; ++i) v.push_back({trackerPose_, std::string(roles[i]) + "/input/grip/pose"});
    Suggest("/interaction_profiles/htc/vive_tracker_htcx", v);
    for (int i = 0; i < kTrackerCount; ++i) {
      XrActionSpaceCreateInfo sci{XR_TYPE_ACTION_SPACE_CREATE_INFO};
      sci.poseInActionSpace.orientation.w = 1.0f;
      sci.subactionPath = trackerPaths_[i];
      sci.action = trackerPose_;
      if (XR_FAILED(xrCreateActionSpace(session_, &sci, &trackerSpaces_[i]))) trackerSpaces_[i] = XR_NULL_HANDLE;
    }
    info_.bodyTrackers = true;
  }

  void LocateTrackers(TrackerState out[kTrackerCount]) override {
    for (int i = 0; i < kTrackerCount; ++i) {
      out[i] = TrackerState{};
      if (!trackerSpaces_[i] || !session_) continue;
      XrActionStatePose st{XR_TYPE_ACTION_STATE_POSE};
      XrActionStateGetInfo gi{XR_TYPE_ACTION_STATE_GET_INFO};
      gi.action = trackerPose_;
      gi.subactionPath = trackerPaths_[i];
      if (XR_FAILED(xrGetActionStatePose(session_, &gi, &st)) || !st.isActive) continue;
      XrSpaceLocation loc{XR_TYPE_SPACE_LOCATION};
      if (XR_FAILED(xrLocateSpace(trackerSpaces_[i], appSpace_, frameState_.predictedDisplayTime, &loc))) continue;
      const bool ok = (loc.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) && (loc.locationFlags & XR_SPACE_LOCATION_ORIENTATION_VALID_BIT);
      if (ok) {
        out[i].valid = true;
        out[i].pose = ToPose(loc.pose);
      }
    }
  }

  void InitHandTracking() {
    if (!hasHandTracking_) return;
    PFN_xrCreateHandTrackerEXT create = nullptr;
    Proc("xrCreateHandTrackerEXT", create);
    Proc("xrDestroyHandTrackerEXT", xrDestroyHandTrackerEXT_);
    Proc("xrLocateHandJointsEXT", xrLocateHandJointsEXT_);
    if (!create || !xrDestroyHandTrackerEXT_ || !xrLocateHandJointsEXT_) return;
    for (int i = 0; i < 2; ++i) {
      XrHandTrackerCreateInfoEXT ci{XR_TYPE_HAND_TRACKER_CREATE_INFO_EXT};
      ci.hand = i == 0 ? XR_HAND_LEFT_EXT : XR_HAND_RIGHT_EXT;
      ci.handJointSet = XR_HAND_JOINT_SET_DEFAULT_EXT;
      if (XR_FAILED(create(session_, &ci, &hands_[i].tracker))) hands_[i].tracker = XR_NULL_HANDLE;
    }
    info_.handTracking = hands_[0].tracker != XR_NULL_HANDLE || hands_[1].tracker != XR_NULL_HANDLE;
  }

  void InitRefreshRate() {
    if (!hasRefreshRate_) return;
    Proc("xrEnumerateDisplayRefreshRatesFB", xrEnumerateDisplayRefreshRatesFB_);
    Proc("xrGetDisplayRefreshRateFB", xrGetDisplayRefreshRateFB_);
    Proc("xrRequestDisplayRefreshRateFB", xrRequestDisplayRefreshRateFB_);
    info_.refreshRateControl = xrEnumerateDisplayRefreshRatesFB_ && xrRequestDisplayRefreshRateFB_;
  }

  void RefreshProfiles() {
    for (auto& h : hands_) {
      h.profile.clear();
      XrInteractionProfileState st{XR_TYPE_INTERACTION_PROFILE_STATE};
      if (XR_FAILED(xrGetCurrentInteractionProfile(session_, h.path, &st)) || st.interactionProfile == XR_NULL_PATH) continue;
      char buf[XR_MAX_PATH_LENGTH] = {};
      uint32_t len = 0;
      if (XR_SUCCEEDED(xrPathToString(instance_, st.interactionProfile, sizeof(buf), &len, buf))) h.profile = buf;
    }
  }

  // ------------------------------------------------------------------ 状態

  XrInstance instance_ = XR_NULL_HANDLE;
  XrSystemId systemId_ = XR_NULL_SYSTEM_ID;
  XrSession session_ = XR_NULL_HANDLE;
  XrSpace appSpace_ = XR_NULL_HANDLE;
  XrSessionState state_ = XR_SESSION_STATE_UNKNOWN;
  XrFrameState frameState_{XR_TYPE_FRAME_STATE};
  std::atomic<bool> running_{false};
  bool exitQueued_ = false;
  bool hasLocalFloor_ = false, hasHandTracking_ = false, hasRefreshRate_ = false, hasTouchPlus_ = false, hasViveTracker_ = false;
  XrAction trackerPose_ = XR_NULL_HANDLE;
  XrPath trackerPaths_[kTrackerCount] = {};
  XrSpace trackerSpaces_[kTrackerCount] = {};

  EyeSwapchain eyes_[2];
  HandActions hands_[2];
  XrActionSet actionSet_ = XR_NULL_HANDLE;
  XrAction gripPose_ = XR_NULL_HANDLE, aimPose_ = XR_NULL_HANDLE, haptic_ = XR_NULL_HANDLE;
  XrAction trigger_ = XR_NULL_HANDLE, triggerTouch_ = XR_NULL_HANDLE, squeeze_ = XR_NULL_HANDLE;
  XrAction thumbstick_ = XR_NULL_HANDLE, thumbstickClick_ = XR_NULL_HANDLE, thumbstickTouch_ = XR_NULL_HANDLE;
  XrAction trackpad_ = XR_NULL_HANDLE, trackpadClick_ = XR_NULL_HANDLE, trackpadTouch_ = XR_NULL_HANDLE;
  XrAction primary_ = XR_NULL_HANDLE, primaryTouch_ = XR_NULL_HANDLE;
  XrAction secondary_ = XR_NULL_HANDLE, secondaryTouch_ = XR_NULL_HANDLE, menu_ = XR_NULL_HANDLE;

  PFN_xrDestroyHandTrackerEXT xrDestroyHandTrackerEXT_ = nullptr;
  PFN_xrLocateHandJointsEXT xrLocateHandJointsEXT_ = nullptr;
  PFN_xrEnumerateDisplayRefreshRatesFB xrEnumerateDisplayRefreshRatesFB_ = nullptr;
  PFN_xrGetDisplayRefreshRateFB xrGetDisplayRefreshRateFB_ = nullptr;
  PFN_xrRequestDisplayRefreshRateFB xrRequestDisplayRefreshRateFB_ = nullptr;

  ID3D11Device* device_ = nullptr;
  ID3D11DeviceContext* context_ = nullptr;
};

}  // namespace

SessionBase* CreateOpenXrSession(const std::string& appName, double resolutionScale) {
  return new OpenXrSession(appName, resolutionScale);
}

}  // namespace tentenv
