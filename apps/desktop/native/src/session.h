// TenTenV desktop — XR session backends shared by the N-API wrapper (addon.cpp)
//
// SessionBase は「1 フレームの流れ」を表す抽象クラス。実体は 2 つ:
//   OpenXrSession  … OpenXR + D3D11（openxr_session.cpp）
//   MockSession    … ランタイム無しで動く疑似 HMD（mock_session.cpp）。自己テスト用
//
// JS からの 1 フレームの呼び出し順:
//   pollEvents() → await waitFrame() → beginFrame() → locateViews() → syncInput()
//   → （ページが描画）→ await submit(pixels…) → endFrame()

#pragma once

#include <atomic>
#include <cstdint>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

namespace tentenv {

struct Posef {
  float p[3] = {0, 0, 0};
  float q[4] = {0, 0, 0, 1};  // x, y, z, w
};

struct ViewData {
  Posef pose;
  float fov[4] = {0, 0, 0, 0};  // left, right, up, down（ラジアン）
};

struct ViewsResult {
  bool valid = false;
  bool positionTracked = false;
  ViewData views[2];
  uint64_t seq = 0;
};

// WebXR の関節順（wrist, thumb-metacarpal … pinky-finger-tip）25 個 + 手のひら（palm）1 個
constexpr int kJointCount = 26;
constexpr int kJointStride = 8;  // px py pz qx qy qz qw radius（radius < 0 は無効）

struct HandState {
  bool controllerActive = false;  // コントローラーの姿勢が取れている
  std::string profile;            // /interaction_profiles/...（不明なら空）
  bool gripValid = false, aimValid = false;
  Posef grip, aim;
  float trigger = 0, squeeze = 0;
  float stick[2] = {0, 0}, pad[2] = {0, 0};
  bool hasStick = false, hasPad = false;
  bool triggerTouch = false, stickClick = false, stickTouch = false, padClick = false, padTouch = false;
  bool primary = false, primaryTouch = false, secondary = false, secondaryTouch = false, menu = false;
  bool jointsValid = false;
  float joints[kJointCount * kJointStride] = {};
};

// 体に付けるトラッカー（SteamVR の Vive トラッカーなど）: 腰・左足・右足
constexpr int kTrackerCount = 3;
struct TrackerState {
  bool valid = false;
  Posef pose;
};

struct FrameTiming {
  bool shouldRender = false;
  double periodMs = 0;
  double displayTimeMs = 0;
};

struct Event {
  std::string type;    // state / begin / end / exit / profiles / reset / refreshrate / error
  std::string detail;
  double value = 0;
};

struct SessionInfo {
  std::string backend;       // openxr / mock
  std::string runtimeName;
  std::string systemName;
  std::string adapterName;
  std::string space;         // stage / local-floor / local（ネイティブ側の基準空間）
  int width = 0, height = 0; // 片目のスワップチェーンの大きさ
  bool bgra = false;
  bool srgb = false;
  std::vector<std::pair<int, int>> recommended;
  bool handTracking = false;
  bool refreshRateControl = false;
  bool bodyTrackers = false;  // 体のトラッカーを読める（XR_HTCX_vive_tracker_interaction など）
};

struct SubmitStats {
  uint64_t submits = 0;          // 書き込みを終えた画像の数
  uint64_t layersSubmitted = 0;  // endFrame で実際にレイヤーとして出した数
  uint64_t frames = 0;           // endFrame の回数
  uint64_t haptics = 0;
  uint8_t sample[2][4] = {};     // 各眼の中央のピクセル（RGBA の順に並べ直し済み）
  double lastCopyMs = 0;
};

class SessionBase {
 public:
  virtual ~SessionBase() = default;

  const SessionInfo& Info() const { return info_; }

  virtual std::vector<Event> PollEvents() = 0;
  virtual bool Running() const = 0;
  // 別スレッドから呼ばれる（ブロックする）。失敗時は std::runtime_error
  virtual void WaitFrame(FrameTiming& out) = 0;
  virtual void BeginFrame() = 0;
  virtual ViewsResult LocateViews() = 0;
  virtual void SyncInput(HandState out[2]) = 0;
  // SyncInput の後に呼ぶ。読めないトラッカーは valid = false
  virtual void LocateTrackers(TrackerState out[kTrackerCount]) {
    for (int i = 0; i < kTrackerCount; ++i) out[i] = TrackerState{};
  }
  // 別スレッドから呼ばれる: 横並び両眼の RGBA/BGRA をステージングへ書く
  virtual void CopyPixels(int slot, const uint8_t* data, const size_t offs[2], uint32_t pitch) = 0;
  // JS のスレッド: ステージングからスワップチェーンへ（seq はその画像を描いたときの姿勢）
  virtual void CommitPixels(int slot, uint64_t seq) = 0;
  virtual bool EndFrame() = 0;
  virtual void Haptics(int hand, float amplitude, double durationMs, float frequency) = 0;
  virtual void StopHaptics(int hand) = 0;
  virtual void RequestExit() = 0;
  virtual bool Bounds(float& width, float& depth) = 0;
  virtual std::vector<float> RefreshRates() = 0;
  virtual float RefreshRate() = 0;
  virtual bool SetRefreshRate(float hz) = 0;
  virtual void Shutdown() = 0;

  int StagingSlots() const { return 2; }

  SubmitStats Stats() {
    std::lock_guard<std::mutex> lock(statsMutex_);
    return stats_;
  }

  // 中央のピクセルを記録（自己テストで「画像が届いたか」を確かめるため）
  void SamplePixels(const uint8_t* data, const size_t offs[2], uint32_t pitch, double copyMs) {
    std::lock_guard<std::mutex> lock(statsMutex_);
    for (int eye = 0; eye < 2; ++eye) {
      const uint8_t* px = data + offs[eye] + static_cast<size_t>(info_.height / 2) * pitch + static_cast<size_t>(info_.width / 2) * 4;
      if (info_.bgra) {
        stats_.sample[eye][0] = px[2];
        stats_.sample[eye][1] = px[1];
        stats_.sample[eye][2] = px[0];
      } else {
        stats_.sample[eye][0] = px[0];
        stats_.sample[eye][1] = px[1];
        stats_.sample[eye][2] = px[2];
      }
      stats_.sample[eye][3] = px[3];
    }
    stats_.lastCopyMs = copyMs;
  }

 protected:
  void CountSubmit() {
    std::lock_guard<std::mutex> lock(statsMutex_);
    ++stats_.submits;
  }
  void CountFrame(bool layer) {
    std::lock_guard<std::mutex> lock(statsMutex_);
    ++stats_.frames;
    if (layer) ++stats_.layersSubmitted;
  }
  void CountHaptics() {
    std::lock_guard<std::mutex> lock(statsMutex_);
    ++stats_.haptics;
  }

  // locateViews() ごとの姿勢を覚えておき、後から届いた画像をその姿勢で提出する
  static constexpr int kViewRing = 16;
  ViewData viewRing_[kViewRing][2];
  ViewData submittedViews_[2];
  uint64_t locateSeq_ = 0;
  bool hasImage_ = false;

  SessionInfo info_;

 private:
  std::mutex statsMutex_;
  SubmitStats stats_;
};

SessionBase* CreateOpenXrSession(const std::string& appName, double resolutionScale);
SessionBase* CreateMockSession(double resolutionScale, const std::string& inputMode, double fps);

}  // namespace tentenv
