// TenTenV desktop — Node.js native addon (N-API)
//
// exports:
//   activeRuntime()                      … 登録済みの OpenXR ランタイム（レジストリ / XR_RUNTIME_JSON）を調べるだけ（起動しない）
//   probeRuntime()                       … インスタンスを作って HMD の有無を確かめる（SteamVR などが起動することがある）
//   XrSession({ mock, appName, resolutionScale, mockInput, mockFps })
//   steamvrManifest(op, openvrDll, arg)  … SteamVR（OpenVR IVRApplications）へ .vrmanifest を登録 / 解除 / 確認
//   version

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#define XR_USE_PLATFORM_WIN32
#define XR_USE_GRAPHICS_API_D3D11
#include <d3d11.h>
#include <openxr/openxr.h>
#include <openxr/openxr_platform.h>

#include <napi.h>

#include <atomic>
#include <memory>
#include <string>

#include "session.h"

using tentenv::Event;
using tentenv::FrameTiming;
using tentenv::HandState;
using tentenv::kJointCount;
using tentenv::kJointStride;
using tentenv::kTrackerCount;
using tentenv::TrackerState;
using tentenv::SessionBase;
using tentenv::ViewsResult;

namespace {

constexpr const char* kVersion = "0.1.0";

std::wstring Widen(const std::string& s) {
  if (s.empty()) return L"";
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
  std::wstring w(n, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, w.data(), n);
  w.resize(n - 1);
  return w;
}

std::string Narrow(const std::wstring& w) {
  if (w.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, nullptr, 0, nullptr, nullptr);
  std::string s(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, s.data(), n, nullptr, nullptr);
  s.resize(n - 1);
  return s;
}

Napi::Float32Array PoseArray(Napi::Env env, const tentenv::Posef& p) {
  auto a = Napi::Float32Array::New(env, 7);
  for (int i = 0; i < 3; ++i) a[i] = p.p[i];
  for (int i = 0; i < 4; ++i) a[3 + i] = p.q[i];
  return a;
}

// ------------------------------------------------------------------ XrSession（JS クラス）

class XrSessionWrap : public Napi::ObjectWrap<XrSessionWrap> {
 public:
  static Napi::Function Define(Napi::Env env) {
    return DefineClass(env, "XrSession",
                       {
                           InstanceMethod("getInfo", &XrSessionWrap::GetInfo),
                           InstanceMethod("isRunning", &XrSessionWrap::IsRunning),
                           InstanceMethod("pollEvents", &XrSessionWrap::PollEvents),
                           InstanceMethod("waitFrame", &XrSessionWrap::WaitFrame),
                           InstanceMethod("beginFrame", &XrSessionWrap::BeginFrame),
                           InstanceMethod("locateViews", &XrSessionWrap::LocateViews),
                           InstanceMethod("syncInput", &XrSessionWrap::SyncInput),
                           InstanceMethod("locateTrackers", &XrSessionWrap::LocateTrackers),
                           InstanceMethod("submit", &XrSessionWrap::Submit),
                           InstanceMethod("endFrame", &XrSessionWrap::EndFrame),
                           InstanceMethod("applyHaptics", &XrSessionWrap::ApplyHaptics),
                           InstanceMethod("stopHaptics", &XrSessionWrap::StopHaptics),
                           InstanceMethod("requestExit", &XrSessionWrap::RequestExit),
                           InstanceMethod("getBounds", &XrSessionWrap::GetBounds),
                           InstanceMethod("getRefreshRates", &XrSessionWrap::GetRefreshRates),
                           InstanceMethod("getRefreshRate", &XrSessionWrap::GetRefreshRate),
                           InstanceMethod("setRefreshRate", &XrSessionWrap::SetRefreshRate),
                           InstanceMethod("getStats", &XrSessionWrap::GetStats),
                           InstanceMethod("destroy", &XrSessionWrap::Destroy),
                       });
  }

  XrSessionWrap(const Napi::CallbackInfo& info) : Napi::ObjectWrap<XrSessionWrap>(info) {
    Napi::Env env = info.Env();
    bool mock = false;
    std::string appName = "TenTenV";
    std::string mockInput = "cycle";
    double scale = 1.0, mockFps = 72.0;
    if (info.Length() > 0 && info[0].IsObject()) {
      auto o = info[0].As<Napi::Object>();
      if (o.Has("mock")) mock = o.Get("mock").ToBoolean().Value();
      if (o.Has("appName") && o.Get("appName").IsString()) appName = o.Get("appName").As<Napi::String>().Utf8Value();
      if (o.Has("resolutionScale") && o.Get("resolutionScale").IsNumber()) scale = o.Get("resolutionScale").As<Napi::Number>().DoubleValue();
      if (o.Has("mockInput") && o.Get("mockInput").IsString()) mockInput = o.Get("mockInput").As<Napi::String>().Utf8Value();
      if (o.Has("mockFps") && o.Get("mockFps").IsNumber()) mockFps = o.Get("mockFps").As<Napi::Number>().DoubleValue();
    }
    if (!(scale > 0.1 && scale <= 4.0)) scale = 1.0;
    try {
      impl_.reset(mock ? tentenv::CreateMockSession(scale, mockInput, mockFps) : tentenv::CreateOpenXrSession(appName, scale));
    } catch (const std::exception& e) {
      throw Napi::Error::New(env, std::string(mock ? "mock session: " : "OpenXR: ") + e.what());
    }
  }

  ~XrSessionWrap() override {
    // 非同期処理の途中で GC されることはない（処理中は Ref() している）
    impl_.reset();
  }

  SessionBase* Impl(Napi::Env env) {
    if (!impl_ || destroyRequested_) throw Napi::Error::New(env, "XR session is destroyed");
    return impl_.get();
  }

  // 非同期処理の開始と終了（終了時に destroy が待たされていれば実行する）
  void BeginAsync() {
    ++pending_;
    Ref();
  }
  void EndAsync() {
    --pending_;
    if (destroyRequested_ && pending_ == 0 && impl_) {
      impl_->Shutdown();
      impl_.reset();
    }
    Unref();
  }

  // ---------------------------------------------------------------- 情報

  Napi::Value GetInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    const auto& s = Impl(env)->Info();
    auto o = Napi::Object::New(env);
    o.Set("backend", s.backend);
    o.Set("runtimeName", s.runtimeName);
    o.Set("systemName", s.systemName);
    o.Set("adapterName", s.adapterName);
    o.Set("space", s.space);
    o.Set("width", s.width);
    o.Set("height", s.height);
    o.Set("colorFormat", s.bgra ? "bgra8unorm" : "rgba8unorm");
    o.Set("srgb", s.srgb);
    o.Set("handTracking", s.handTracking);
    o.Set("refreshRateControl", s.refreshRateControl);
    o.Set("bodyTrackers", s.bodyTrackers);
    auto rec = Napi::Array::New(env, s.recommended.size());
    for (uint32_t i = 0; i < s.recommended.size(); ++i) {
      auto r = Napi::Object::New(env);
      r.Set("width", s.recommended[i].first);
      r.Set("height", s.recommended[i].second);
      rec.Set(i, r);
    }
    o.Set("recommended", rec);
    o.Set("stagingSlots", impl_->StagingSlots());
    return o;
  }

  Napi::Value IsRunning(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), impl_ && !destroyRequested_ && impl_->Running());
  }

  Napi::Value PollEvents(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto arr = Napi::Array::New(env);
    if (!impl_ || destroyRequested_) {
      auto e = Napi::Object::New(env);
      e.Set("type", "exit");
      e.Set("detail", "destroyed");
      arr.Set(0u, e);
      return arr;
    }
    uint32_t n = 0;
    for (const Event& ev : impl_->PollEvents()) {
      auto e = Napi::Object::New(env);
      e.Set("type", ev.type);
      if (!ev.detail.empty()) e.Set("detail", ev.detail);
      if (ev.value != 0) e.Set("value", ev.value);
      arr.Set(n++, e);
    }
    return arr;
  }

  // ---------------------------------------------------------------- フレーム

  class WaitFrameWorker : public Napi::AsyncWorker {
   public:
    WaitFrameWorker(Napi::Env env, XrSessionWrap* self)
        : Napi::AsyncWorker(env), self_(self), deferred_(Napi::Promise::Deferred::New(env)) {
      self_->BeginAsync();
    }
    Napi::Promise Promise() { return deferred_.Promise(); }
    void Execute() override {
      try {
        self_->impl_->WaitFrame(timing_);
      } catch (const std::exception& e) {
        SetError(e.what());
      }
    }
    void OnOK() override {
      Napi::Env env = Env();
      auto o = Napi::Object::New(env);
      o.Set("shouldRender", timing_.shouldRender);
      o.Set("predictedDisplayPeriodMs", timing_.periodMs);
      o.Set("predictedDisplayTimeMs", timing_.displayTimeMs);
      self_->waiting_ = false;
      self_->EndAsync();
      deferred_.Resolve(o);
    }
    void OnError(const Napi::Error& e) override {
      self_->waiting_ = false;
      self_->EndAsync();
      deferred_.Reject(e.Value());
    }

   private:
    XrSessionWrap* self_;
    Napi::Promise::Deferred deferred_;
    FrameTiming timing_;
  };

  Napi::Value WaitFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto* impl = Impl(env);
    if (!impl->Running()) throw Napi::Error::New(env, "XR session is not running");
    if (waiting_) throw Napi::Error::New(env, "waitFrame is already pending");
    waiting_ = true;
    auto* w = new WaitFrameWorker(env, this);
    auto p = w->Promise();
    w->Queue();
    return p;
  }

  Napi::Value BeginFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    try {
      Impl(env)->BeginFrame();
    } catch (const std::runtime_error& e) {
      throw Napi::Error::New(env, e.what());
    }
    return env.Undefined();
  }

  // { valid, positionTracked, seq, data: Float32Array(22) }
  // data は眼ごとに px py pz qx qy qz qw  fovLeft fovRight fovUp fovDown
  Napi::Value LocateViews(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    ViewsResult r;
    try {
      r = Impl(env)->LocateViews();
    } catch (const std::runtime_error& e) {
      throw Napi::Error::New(env, e.what());
    }
    auto o = Napi::Object::New(env);
    o.Set("valid", r.valid);
    o.Set("positionTracked", r.positionTracked);
    o.Set("seq", static_cast<double>(r.seq));
    auto d = Napi::Float32Array::New(env, 22);
    for (int eye = 0; eye < 2; ++eye) {
      const auto& v = r.views[eye];
      const size_t b = eye * 11;
      for (int k = 0; k < 3; ++k) d[b + k] = v.pose.p[k];
      for (int k = 0; k < 4; ++k) d[b + 3 + k] = v.pose.q[k];
      for (int k = 0; k < 4; ++k) d[b + 7 + k] = v.fov[k];
    }
    o.Set("data", d);
    return o;
  }

  Napi::Value SyncInput(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    HandState hands[2];
    try {
      Impl(env)->SyncInput(hands);
    } catch (const std::runtime_error& e) {
      throw Napi::Error::New(env, e.what());
    }
    auto arr = Napi::Array::New(env, 2);
    for (uint32_t i = 0; i < 2; ++i) {
      const HandState& h = hands[i];
      auto o = Napi::Object::New(env);
      o.Set("handedness", i == 0 ? "left" : "right");
      o.Set("controller", h.controllerActive);
      o.Set("profile", h.profile);
      o.Set("grip", h.gripValid ? PoseArray(env, h.grip) : env.Null());
      o.Set("aim", h.aimValid ? PoseArray(env, h.aim) : env.Null());
      o.Set("trigger", h.trigger);
      o.Set("squeeze", h.squeeze);
      auto stick = Napi::Float32Array::New(env, 2);
      stick[0] = h.stick[0];
      stick[1] = h.stick[1];
      auto pad = Napi::Float32Array::New(env, 2);
      pad[0] = h.pad[0];
      pad[1] = h.pad[1];
      o.Set("thumbstick", stick);
      o.Set("trackpad", pad);
      o.Set("hasThumbstick", h.hasStick);
      o.Set("hasTrackpad", h.hasPad);
      o.Set("triggerTouch", h.triggerTouch);
      o.Set("thumbstickClick", h.stickClick);
      o.Set("thumbstickTouch", h.stickTouch);
      o.Set("trackpadClick", h.padClick);
      o.Set("trackpadTouch", h.padTouch);
      o.Set("primary", h.primary);
      o.Set("primaryTouch", h.primaryTouch);
      o.Set("secondary", h.secondary);
      o.Set("secondaryTouch", h.secondaryTouch);
      o.Set("menu", h.menu);
      if (h.jointsValid) {
        auto j = Napi::Float32Array::New(env, kJointCount * kJointStride);
        for (int k = 0; k < kJointCount * kJointStride; ++k) j[k] = h.joints[k];
        o.Set("joints", j);
      } else {
        o.Set("joints", env.Null());
      }
      arr.Set(i, o);
    }
    return arr;
  }

  // locateTrackers() -> [腰, 左足, 右足]（それぞれ Float32Array[px py pz qx qy qz qw] か null）。syncInput の後に呼ぶ
  Napi::Value LocateTrackers(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    TrackerState t[kTrackerCount];
    try {
      Impl(env)->LocateTrackers(t);
    } catch (const std::runtime_error& e) {
      throw Napi::Error::New(env, e.what());
    }
    auto arr = Napi::Array::New(env, kTrackerCount);
    for (uint32_t i = 0; i < kTrackerCount; ++i) arr.Set(i, t[i].valid ? PoseArray(env, t[i].pose) : env.Null());
    return arr;
  }

  // submit(pixels: ArrayBuffer | TypedArray, offsetLeft, offsetRight, rowPitch, seq) -> Promise<{ copyMs }>
  // 横並び両眼の 1 枚（上の行から）。Promise が解決するまで pixels を書き換え・解放しないこと
  class SubmitWorker : public Napi::AsyncWorker {
   public:
    SubmitWorker(Napi::Env env, XrSessionWrap* self, Napi::Object holder, const uint8_t* data, size_t offL, size_t offR,
                 uint32_t pitch, uint64_t seq, int slot)
        : Napi::AsyncWorker(env),
          self_(self),
          deferred_(Napi::Promise::Deferred::New(env)),
          data_(data),
          offs_{offL, offR},
          pitch_(pitch),
          seq_(seq),
          slot_(slot) {
      holder_ = Napi::Persistent(holder);
      self_->BeginAsync();
    }
    Napi::Promise Promise() { return deferred_.Promise(); }
    void Execute() override {
      try {
        self_->impl_->CopyPixels(slot_, data_, offs_, pitch_);
      } catch (const std::exception& e) {
        SetError(e.what());
      }
    }
    void OnOK() override {
      Napi::Env env = Env();
      self_->slotBusy_[slot_] = false;
      std::string err;
      if (self_->impl_ && !self_->destroyRequested_) {
        try {
          self_->impl_->CommitPixels(slot_, seq_);
        } catch (const std::exception& e) {
          err = e.what();
        }
      }
      auto stats = self_->impl_ ? self_->impl_->Stats() : tentenv::SubmitStats{};
      self_->EndAsync();
      if (!err.empty()) {
        deferred_.Reject(Napi::Error::New(env, err).Value());
        return;
      }
      auto o = Napi::Object::New(env);
      o.Set("copyMs", stats.lastCopyMs);
      deferred_.Resolve(o);
    }
    void OnError(const Napi::Error& e) override {
      self_->slotBusy_[slot_] = false;
      self_->EndAsync();
      deferred_.Reject(e.Value());
    }

   private:
    XrSessionWrap* self_;
    Napi::Promise::Deferred deferred_;
    Napi::ObjectReference holder_;
    const uint8_t* data_;
    size_t offs_[2];
    uint32_t pitch_;
    uint64_t seq_;
    int slot_;
  };

  Napi::Value Submit(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto* impl = Impl(env);
    const uint8_t* data = nullptr;
    size_t length = 0;
    Napi::Object holder;
    if (info[0].IsArrayBuffer()) {
      auto ab = info[0].As<Napi::ArrayBuffer>();
      data = static_cast<const uint8_t*>(ab.Data());
      length = ab.ByteLength();
      holder = ab;
    } else if (info[0].IsTypedArray()) {
      auto ta = info[0].As<Napi::TypedArray>();
      data = static_cast<const uint8_t*>(ta.ArrayBuffer().Data()) + ta.ByteOffset();
      length = ta.ByteLength();
      holder = ta;
    } else {
      throw Napi::TypeError::New(env, "pixels must be an ArrayBuffer or a TypedArray");
    }
    const size_t offL = static_cast<size_t>(info[1].ToNumber().Int64Value());
    const size_t offR = static_cast<size_t>(info[2].ToNumber().Int64Value());
    const uint32_t pitch = info[3].ToNumber().Uint32Value();
    const uint64_t seq = static_cast<uint64_t>(info.Length() > 4 ? info[4].ToNumber().Int64Value() : 0);
    const auto& s = impl->Info();
    const size_t need = static_cast<size_t>(pitch) * (s.height - 1) + static_cast<size_t>(s.width) * 4;
    if (!data || pitch < static_cast<uint32_t>(s.width) * 4 || offL + need > length || offR + need > length) {
      throw Napi::RangeError::New(env, "pixel buffer too small for " + std::to_string(s.width) + "x" + std::to_string(s.height) + " per eye");
    }
    int slot = -1;
    for (int i = 0; i < 2; ++i) {
      if (!slotBusy_[i]) {
        slot = i;
        break;
      }
    }
    if (slot < 0) throw Napi::Error::New(env, "busy: both staging slots are in flight");
    slotBusy_[slot] = true;
    auto* w = new SubmitWorker(env, this, holder, data, offL, offR, pitch, seq, slot);
    auto p = w->Promise();
    w->Queue();
    return p;
  }

  Napi::Value EndFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    try {
      return Napi::Boolean::New(env, Impl(env)->EndFrame());
    } catch (const std::runtime_error& e) {
      throw Napi::Error::New(env, e.what());
    }
  }

  // applyHaptics(hand 0|1, amplitude 0..1, durationMs, frequencyHz?)
  Napi::Value ApplyHaptics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!impl_ || destroyRequested_) return env.Undefined();
    const int hand = info[0].ToNumber().Int32Value();
    const float amp = static_cast<float>(info[1].ToNumber().DoubleValue());
    const double ms = info[2].ToNumber().DoubleValue();
    const float freq = info.Length() > 3 && info[3].IsNumber() ? static_cast<float>(info[3].ToNumber().DoubleValue()) : 0.0f;
    impl_->Haptics(hand, amp, ms, freq);
    return env.Undefined();
  }

  Napi::Value StopHaptics(const Napi::CallbackInfo& info) {
    if (impl_ && !destroyRequested_) impl_->StopHaptics(info[0].ToNumber().Int32Value());
    return info.Env().Undefined();
  }

  Napi::Value RequestExit(const Napi::CallbackInfo& info) {
    if (impl_ && !destroyRequested_) impl_->RequestExit();
    return info.Env().Undefined();
  }

  // プレイエリア（STAGE）の大きさ [幅, 奥行き]（メートル）。分からなければ null
  Napi::Value GetBounds(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    float w = 0, d = 0;
    if (!impl_ || destroyRequested_ || !impl_->Bounds(w, d)) return env.Null();
    auto a = Napi::Float32Array::New(env, 2);
    a[0] = w;
    a[1] = d;
    return a;
  }

  Napi::Value GetRefreshRates(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!impl_ || destroyRequested_) return env.Null();
    auto rates = impl_->RefreshRates();
    if (rates.empty()) return env.Null();
    auto a = Napi::Float32Array::New(env, rates.size());
    for (size_t i = 0; i < rates.size(); ++i) a[i] = rates[i];
    return a;
  }

  Napi::Value GetRefreshRate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    float hz = impl_ && !destroyRequested_ ? impl_->RefreshRate() : 0;
    return hz > 0 ? Napi::Number::New(env, hz) : env.Null();
  }

  Napi::Value SetRefreshRate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!impl_ || destroyRequested_) return Napi::Boolean::New(env, false);
    return Napi::Boolean::New(env, impl_->SetRefreshRate(static_cast<float>(info[0].ToNumber().DoubleValue())));
  }

  Napi::Value GetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!impl_) return env.Null();
    auto s = impl_->Stats();
    auto o = Napi::Object::New(env);
    o.Set("submits", static_cast<double>(s.submits));
    o.Set("layersSubmitted", static_cast<double>(s.layersSubmitted));
    o.Set("frames", static_cast<double>(s.frames));
    o.Set("haptics", static_cast<double>(s.haptics));
    o.Set("lastCopyMs", s.lastCopyMs);
    for (int eye = 0; eye < 2; ++eye) {
      auto px = Napi::Array::New(env, 4);
      for (uint32_t k = 0; k < 4; ++k) px.Set(k, s.sample[eye][k]);
      o.Set(eye == 0 ? "sampleLeft" : "sampleRight", px);
    }
    return o;
  }

  Napi::Value Destroy(const Napi::CallbackInfo& info) {
    if (impl_ && !destroyRequested_) {
      destroyRequested_ = true;
      if (pending_ == 0) {
        impl_->Shutdown();
        impl_.reset();
      }
    }
    return info.Env().Undefined();
  }

 private:
  std::unique_ptr<SessionBase> impl_;
  int pending_ = 0;
  bool destroyRequested_ = false;
  bool waiting_ = false;
  bool slotBusy_[2] = {false, false};
};

// ------------------------------------------------------------------ ランタイムの確認

// XR_RUNTIME_JSON または HKLM\SOFTWARE\Khronos\OpenXR\1\ActiveRuntime（ランタイムは起動しない）
Napi::Value ActiveRuntime(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto o = Napi::Object::New(env);
  wchar_t buf[2048] = {};
  DWORD n = GetEnvironmentVariableW(L"XR_RUNTIME_JSON", buf, static_cast<DWORD>(std::size(buf)));
  std::wstring path;
  std::string source;
  if (n > 0 && n < std::size(buf)) {
    path = buf;
    source = "env";
  } else {
    DWORD size = sizeof(buf);
    if (RegGetValueW(HKEY_LOCAL_MACHINE, L"SOFTWARE\\Khronos\\OpenXR\\1", L"ActiveRuntime", RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY,
                     nullptr, buf, &size) == ERROR_SUCCESS) {
      path = buf;
      source = "registry";
    }
  }
  const bool exists = !path.empty() && GetFileAttributesW(path.c_str()) != INVALID_FILE_ATTRIBUTES;
  o.Set("found", exists);
  o.Set("manifestPath", path.empty() ? env.Null() : Napi::String::New(env, Narrow(path)));
  o.Set("source", source.empty() ? env.Null() : Napi::String::New(env, source));
  return o;
}

// インスタンスを作って HMD を探す（セッションは作らない）
Napi::Value ProbeRuntime(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto o = Napi::Object::New(env);
  XrInstanceCreateInfo ci{XR_TYPE_INSTANCE_CREATE_INFO};
  strcpy_s(ci.applicationInfo.applicationName, "TenTenV probe");
  ci.applicationInfo.apiVersion = XR_API_VERSION_1_0;
  const char* ext = XR_KHR_D3D11_ENABLE_EXTENSION_NAME;
  ci.enabledExtensionCount = 1;
  ci.enabledExtensionNames = &ext;
  XrInstance inst = XR_NULL_HANDLE;
  XrResult r = xrCreateInstance(&ci, &inst);
  if (XR_FAILED(r)) {
    o.Set("ok", false);
    o.Set("error", "xrCreateInstance -> XrResult(" + std::to_string(static_cast<int>(r)) + ")");
    return o;
  }
  XrInstanceProperties ip{XR_TYPE_INSTANCE_PROPERTIES};
  xrGetInstanceProperties(inst, &ip);
  o.Set("runtimeName", ip.runtimeName);
  XrSystemGetInfo sgi{XR_TYPE_SYSTEM_GET_INFO};
  sgi.formFactor = XR_FORM_FACTOR_HEAD_MOUNTED_DISPLAY;
  XrSystemId sys = XR_NULL_SYSTEM_ID;
  r = xrGetSystem(inst, &sgi, &sys);
  o.Set("ok", XR_SUCCEEDED(r));
  if (XR_SUCCEEDED(r)) {
    XrSystemProperties sp{XR_TYPE_SYSTEM_PROPERTIES};
    xrGetSystemProperties(inst, sys, &sp);
    o.Set("systemName", sp.systemName);
  } else {
    char s[XR_MAX_RESULT_STRING_SIZE] = {};
    xrResultToString(inst, r, s);
    o.Set("error", std::string("xrGetSystem -> ") + s);
  }
  xrDestroyInstance(inst);
  return o;
}

// ------------------------------------------------------------------ SteamVR への登録
//
// SteamVR に付属の openvr_api.dll を「ユーティリティ」として初期化し、IVRApplications の
// フラット関数表（FnTable:IVRApplications_007）で .vrmanifest を登録 / 解除する。
// 関数表の並びは OpenVR SDK（BSD-3-Clause）の openvr_capi.h に従う（先頭 3 つだけ使う）。

namespace openvr {
using PFN_InitInternal2 = uint32_t(__cdecl*)(int* peError, int eType, const char* pStartupInfo);
using PFN_ShutdownInternal = void(__cdecl*)();
using PFN_GetGenericInterface = void*(__cdecl*)(const char* pchInterfaceVersion, int* peError);
struct IVRApplicationsFnTable {
  int(__stdcall* AddApplicationManifest)(const char* pchApplicationManifestFullPath, bool bTemporary);
  int(__stdcall* RemoveApplicationManifest)(const char* pchApplicationManifestFullPath);
  bool(__stdcall* IsApplicationInstalled)(const char* pchAppKey);
};
constexpr int kApplicationUtility = 3;
}  // namespace openvr

// steamvrManifest(op: 'add' | 'remove' | 'check', openvrDllPath, manifestPath | appKey) -> { ok, error?, installed? }
Napi::Value SteamVRManifest(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const std::string op = info[0].ToString().Utf8Value();
  const std::string dll = info[1].ToString().Utf8Value();
  const std::string arg = info[2].ToString().Utf8Value();
  auto result = Napi::Object::New(env);
  auto fail = [&](const std::string& msg) {
    result.Set("ok", false);
    result.Set("error", msg);
    return result;
  };
  HMODULE mod = LoadLibraryW(Widen(dll).c_str());
  if (!mod) return fail("cannot load openvr_api.dll: " + dll);
  auto init = reinterpret_cast<openvr::PFN_InitInternal2>(GetProcAddress(mod, "VR_InitInternal2"));
  auto shutdown = reinterpret_cast<openvr::PFN_ShutdownInternal>(GetProcAddress(mod, "VR_ShutdownInternal"));
  auto getIface = reinterpret_cast<openvr::PFN_GetGenericInterface>(GetProcAddress(mod, "VR_GetGenericInterface"));
  if (!init || !shutdown || !getIface) {
    FreeLibrary(mod);
    return fail("openvr_api.dll does not export VR_InitInternal2 / VR_GetGenericInterface");
  }
  int err = 0;
  init(&err, openvr::kApplicationUtility, nullptr);
  if (err != 0) {
    FreeLibrary(mod);
    result.Set("initError", err);
    return fail("VR_Init failed (EVRInitError " + std::to_string(err) + "); is SteamVR running?");
  }
  auto* apps = reinterpret_cast<openvr::IVRApplicationsFnTable*>(getIface("FnTable:IVRApplications_007", &err));
  if (!apps || err != 0) {
    shutdown();
    FreeLibrary(mod);
    return fail("IVRApplications_007 is not available (" + std::to_string(err) + ")");
  }
  int appErr = 0;
  if (op == "add") {
    appErr = apps->AddApplicationManifest(arg.c_str(), false);
  } else if (op == "remove") {
    appErr = apps->RemoveApplicationManifest(arg.c_str());
  } else if (op == "check") {
    result.Set("installed", apps->IsApplicationInstalled(arg.c_str()));
  } else {
    shutdown();
    FreeLibrary(mod);
    return fail("unknown op: " + op);
  }
  shutdown();
  FreeLibrary(mod);
  result.Set("ok", appErr == 0);
  if (appErr != 0) result.Set("error", "EVRApplicationError " + std::to_string(appErr));
  return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("XrSession", XrSessionWrap::Define(env));
  exports.Set("activeRuntime", Napi::Function::New(env, ActiveRuntime));
  exports.Set("probeRuntime", Napi::Function::New(env, ProbeRuntime));
  exports.Set("steamvrManifest", Napi::Function::New(env, SteamVRManifest));
  exports.Set("version", kVersion);
  return exports;
}

}  // namespace

NODE_API_MODULE(tentenv_xr, Init)
