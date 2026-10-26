// TenTenV desktop — mock XR backend
//
// OpenXR ランタイムや HMD が無い環境で、WebXR の経路（フレームループ・姿勢・入力・画像の提出）を
// 一通り動かすための疑似 HMD。自己テスト（--selftest）と開発用。
//   - 72Hz（setRefreshRate で 90 / 120 に変更可）で waitFrame が返る
//   - 頭はゆっくり左右を向く。左右のコントローラーはトリガー・グリップ・スティック・A/B を周期的に操作する
//   - inputMode: controllers / hands / cycle（3 秒ごとにコントローラー ⇔ ハンドトラッキングを切り替える）
//   - 提出された画像は各眼の中央のピクセルだけ記録する（getStats で取れる）

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <thread>

#include "session.h"

namespace tentenv {
namespace {

using Clock = std::chrono::steady_clock;

void YawQuat(float yaw, float q[4]) {
  q[0] = 0;
  q[1] = std::sin(yaw / 2);
  q[2] = 0;
  q[3] = std::cos(yaw / 2);
}

// 回転（クォータニオン）でベクトルを回す
void Rotate(const float q[4], const float v[3], float out[3]) {
  const float x = q[0], y = q[1], z = q[2], w = q[3];
  const float ix = w * v[0] + y * v[2] - z * v[1];
  const float iy = w * v[1] + z * v[0] - x * v[2];
  const float iz = w * v[2] + x * v[1] - y * v[0];
  const float iw = -x * v[0] - y * v[1] - z * v[2];
  out[0] = ix * w + iw * -x + iy * -z - iz * -y;
  out[1] = iy * w + iw * -y + iz * -x - ix * -z;
  out[2] = iz * w + iw * -z + ix * -y - iy * -x;
}

class MockSession final : public SessionBase {
 public:
  MockSession(double scale, const std::string& inputMode, double fps) : inputMode_(inputMode) {
    info_.backend = "mock";
    info_.runtimeName = "TenTenV mock runtime";
    info_.systemName = "Mock HMD";
    info_.adapterName = "(none)";
    info_.space = "stage";
    const int recW = 1440, recH = 1584;
    info_.recommended = {{recW, recH}, {recW, recH}};
    info_.width = std::max(64, static_cast<int>(((std::lround(recW * scale) + 63) / 64) * 64));
    info_.height = std::max(64, static_cast<int>(std::lround(recH * scale)));
    info_.bgra = false;
    info_.srgb = true;
    info_.handTracking = true;
    info_.bodyTrackers = true;
    info_.refreshRateControl = true;
    SetFps(fps > 0 ? static_cast<float>(fps) : 72.0f);
    start_ = Clock::now();
    next_ = start_;
    queue_ = {{"state", "idle"}, {"state", "ready"}, {"begin", ""}, {"state", "synchronized"}, {"state", "visible"}, {"state", "focused"}};
  }

  std::vector<Event> PollEvents() override {
    std::vector<Event> out;
    out.swap(queue_);
    for (const auto& e : out) {
      if (e.type == "begin") running_ = true;
      if (e.type == "end") running_ = false;
      if (e.type == "state") focused_ = e.detail == "focused";
    }
    return out;
  }

  bool Running() const override { return running_; }

  void WaitFrame(FrameTiming& out) override {
    const auto period = std::chrono::microseconds(periodUs_.load());
    next_ += period;
    const auto now = Clock::now();
    if (next_ < now) next_ = now;  // 遅れたら追いつかずに今から数え直す
    std::this_thread::sleep_until(next_);
    out.shouldRender = focused_;
    out.periodMs = periodUs_.load() / 1000.0;
    out.displayTimeMs = std::chrono::duration<double, std::milli>(next_ + period - start_).count();
  }

  void BeginFrame() override {}

  ViewsResult LocateViews() override {
    ViewsResult r;
    r.valid = true;
    r.positionTracked = true;
    const float t = Seconds();
    const float yaw = 0.35f * std::sin(t * 0.6f);
    float q[4];
    YawQuat(yaw, q);
    const float head[3] = {0.05f * std::sin(t * 0.4f), 1.6f, 0.0f};
    const float ipd = 0.064f;
    for (int eye = 0; eye < 2; ++eye) {
      const float off[3] = {eye == 0 ? -ipd / 2 : ipd / 2, 0, 0};
      float o[3];
      Rotate(q, off, o);
      ViewData& v = r.views[eye];
      for (int k = 0; k < 3; ++k) v.pose.p[k] = head[k] + o[k];
      for (int k = 0; k < 4; ++k) v.pose.q[k] = q[k];
      // 実機に近い非対称の視野（左目は外側=左が広い）
      const float outer = 0.94f, inner = 0.82f;
      v.fov[0] = eye == 0 ? -outer : -inner;
      v.fov[1] = eye == 0 ? inner : outer;
      v.fov[2] = 0.87f;
      v.fov[3] = -0.96f;
    }
    r.seq = ++locateSeq_;
    viewRing_[r.seq % kViewRing][0] = r.views[0];
    viewRing_[r.seq % kViewRing][1] = r.views[1];
    return r;
  }

  // 疑似トラッカー: 腰と両足（足は交互に少し上げる）
  void LocateTrackers(TrackerState out[kTrackerCount]) override {
    const float t = Seconds();
    const float pos[kTrackerCount][3] = {{0.0f, 0.95f, 0.02f},
                                         {-0.1f, 0.08f + 0.05f * std::max(0.0f, std::sin(t * 2.0f)), 0.05f},
                                         {0.1f, 0.08f + 0.05f * std::max(0.0f, -std::sin(t * 2.0f)), 0.05f}};
    for (int i = 0; i < kTrackerCount; ++i) {
      out[i].valid = true;
      for (int k = 0; k < 3; ++k) out[i].pose.p[k] = pos[i][k];
      YawQuat(0.0f, out[i].pose.q);
    }
  }

  void SyncInput(HandState out[2]) override {
    const float t = Seconds();
    bool hands = inputMode_ == "hands";
    if (inputMode_ == "cycle") hands = static_cast<int>(t / 3.0f) % 2 == 1;
    for (int i = 0; i < 2; ++i) {
      HandState& h = out[i];
      h = HandState{};
      const float side = i == 0 ? -1.0f : 1.0f;
      const float base[3] = {side * 0.22f, 1.15f + 0.05f * std::sin(t * 1.3f + i), -0.35f + 0.05f * std::cos(t * 0.9f)};
      float q[4];
      YawQuat(side * -0.15f, q);
      if (!hands) {
        h.profile = "/interaction_profiles/oculus/touch_controller";
        h.controllerActive = h.gripValid = h.aimValid = true;
        for (int k = 0; k < 3; ++k) h.grip.p[k] = h.aim.p[k] = base[k];
        for (int k = 0; k < 4; ++k) h.grip.q[k] = h.aim.q[k] = q[k];
        h.aim.p[2] -= 0.05f;
        const float phase = std::fmod(t + i * 0.75f, 1.5f);
        h.trigger = phase < 0.5f ? 1.0f : 0.0f;
        h.triggerTouch = phase < 0.9f;
        h.squeeze = std::fmod(t + 0.4f + i, 2.5f) < 0.6f ? 0.9f : 0.0f;
        h.hasStick = true;
        h.stick[0] = 0.8f * std::cos(t);
        h.stick[1] = 0.8f * std::sin(t);
        h.stickTouch = true;
        h.stickClick = std::fmod(t, 4.0f) < 0.2f;
        h.primary = std::fmod(t + i, 2.0f) < 0.25f;
        h.primaryTouch = h.primary;
        h.secondary = std::fmod(t + 1 + i, 3.0f) < 0.25f;
        h.secondaryTouch = h.secondary;
        continue;
      }
      // ハンドトラッキング: 指を曲げ伸ばしし、2 秒ごとに親指と人差し指でつまむ
      h.jointsValid = true;
      const bool pinch = std::fmod(t + i * 0.5f, 2.0f) < 0.5f;
      const float curl = 0.25f + 0.25f * std::sin(t * 2.0f + i);
      auto put = [&](int j, const float local[3], float radius) {
        float w[3];
        Rotate(q, local, w);
        float* d = h.joints + j * kJointStride;
        d[0] = base[0] + w[0];
        d[1] = base[1] + w[1];
        d[2] = base[2] + w[2];
        d[3] = q[0];
        d[4] = q[1];
        d[5] = q[2];
        d[6] = q[3];
        d[7] = radius;
      };
      const float wrist[3] = {0, 0, 0.06f};
      put(0, wrist, 0.02f);
      const float palm[3] = {0, 0, 0};
      put(kJointCount - 1, palm, 0.025f);
      // 指: 付け根の x 位置と節の数（親指 4、他は 5）
      const float baseX[5] = {-0.035f, -0.022f, 0.0f, 0.02f, 0.036f};
      const float segLen[5] = {0.03f, 0.035f, 0.038f, 0.035f, 0.028f};
      int j = 1;
      float tips[5][3] = {};
      for (int f = 0; f < 5; ++f) {
        const int count = f == 0 ? 4 : 5;
        float p[3] = {side * baseX[f], 0.0f, 0.04f};
        float angle = 0;
        for (int k = 0; k < count; ++k) {
          put(j, p, 0.008f);
          if (k == count - 1) {
            tips[f][0] = p[0];
            tips[f][1] = p[1];
            tips[f][2] = p[2];
          }
          angle += k == 0 ? 0.0f : curl * 0.7f;
          p[1] -= segLen[f] * std::sin(angle);
          p[2] -= segLen[f] * std::cos(angle);
          ++j;
        }
      }
      if (pinch) {
        // 親指の先（index 4）を人差し指の先（index 9）のすぐ隣へ
        float tip[3] = {tips[1][0] - side * 0.004f, tips[1][1], tips[1][2]};
        put(4, tip, 0.008f);
      }
      // ハンドの時の照準: 手首から前へ
      h.aimValid = true;
      for (int k = 0; k < 3; ++k) h.aim.p[k] = base[k];
      for (int k = 0; k < 4; ++k) h.aim.q[k] = q[k];
    }
  }

  void CopyPixels(int, const uint8_t* data, const size_t offs[2], uint32_t pitch) override {
    const auto t0 = Clock::now();
    SamplePixels(data, offs, pitch, std::chrono::duration<double, std::milli>(Clock::now() - t0).count());
  }

  void CommitPixels(int, uint64_t seq) override {
    submittedViews_[0] = viewRing_[seq % kViewRing][0];
    submittedViews_[1] = viewRing_[seq % kViewRing][1];
    hasImage_ = true;
    CountSubmit();
  }

  bool EndFrame() override {
    CountFrame(hasImage_);
    return hasImage_;
  }

  void Haptics(int hand, float, double, float) override {
    if (hand == 0 || hand == 1) CountHaptics();
  }
  void StopHaptics(int) override {}

  void RequestExit() override {
    if (exitRequested_) return;
    exitRequested_ = true;
    queue_.push_back({"state", "stopping"});
    queue_.push_back({"end", ""});
    queue_.push_back({"state", "exiting"});
    queue_.push_back({"exit", "exiting"});
  }

  bool Bounds(float& width, float& depth) override {
    width = 3.0f;
    depth = 2.5f;
    return true;
  }

  std::vector<float> RefreshRates() override { return {72.0f, 90.0f, 120.0f}; }
  float RefreshRate() override { return fps_; }
  bool SetRefreshRate(float hz) override {
    for (float r : RefreshRates()) {
      if (std::fabs(r - hz) < 0.5f) {
        SetFps(r);
        Event e{"refreshrate", ""};
        e.value = r;
        queue_.push_back(e);
        return true;
      }
    }
    return false;
  }

  void Shutdown() override { running_ = false; }

 private:
  float Seconds() const { return std::chrono::duration<float>(Clock::now() - start_).count(); }
  void SetFps(float fps) {
    fps_ = fps;
    periodUs_ = static_cast<int64_t>(1e6 / fps);
  }

  std::string inputMode_;
  std::vector<Event> queue_;
  std::atomic<bool> running_{false};
  std::atomic<bool> focused_{false};
  bool exitRequested_ = false;
  float fps_ = 72;
  std::atomic<int64_t> periodUs_{13889};
  Clock::time_point start_, next_;
};

}  // namespace

SessionBase* CreateMockSession(double resolutionScale, const std::string& inputMode, double fps) {
  return new MockSession(resolutionScale, inputMode, fps);
}

}  // namespace tentenv
