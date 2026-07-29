import Cocoa
import SwiftUI

/*
 * Codex Switch Bar — menu bar companion for the Codex Switch dashboard.
 *
 * Polls the dashboard's existing HTTP API (127.0.0.1:6677) and shows a
 * popover in the dashboard's own theme: the live account with both quota
 * windows, every other account with its quota and a one-click switch,
 * re-login shortcuts for revoked credentials, refresh and dashboard links.
 *
 * The dashboard server must be running; the offline view offers to start it.
 */

// MARK: - API models (trimmed mirror of /api/state)

struct UsageWindow: Codable {
    let usedPercent: Double
    let windowSeconds: Double
    let resetAt: String?
}

struct UsageSnapshot: Codable {
    let limitReached: Bool
    let primary: UsageWindow?
    let secondary: UsageWindow?
    let fetchedAt: String
}

struct UsageError: Codable {
    let code: String
    let message: String
}

struct Identity: Codable {
    let label: String
    let plan: String?
}

struct Profile: Codable {
    let id: String
    let name: String
    let active: Bool
    let identity: Identity?
    let usage: UsageSnapshot?
    let usageError: UsageError?

    /// Same headline window as the dashboard: primary, else secondary.
    var mainWindow: UsageWindow? { usage?.primary ?? usage?.secondary }

    var quotaLeft: Int? {
        guard let w = mainWindow else { return nil }
        return Int((100 - w.usedPercent).rounded())
    }

    /// Mirrors isDeadCredentialError on the web: only a re-login fixes these.
    var isDead: Bool {
        guard let code = usageError?.code else { return false }
        return ["refresh_failed", "token_revoked", "token_invalidated", "http_401"].contains(code)
    }
}

struct StateView: Codable {
    let profiles: [Profile]
}

/// Switch response: either `{ error }`, or `{ result, refresh, state }`.
struct SwitchResponse: Codable {
    struct Result: Codable {
        let success: Bool
    }
    struct Refresh: Codable {
        let warning: String?
    }
    let result: Result?
    let refresh: Refresh?
    let error: String?
}

// MARK: - Dashboard server client

enum Server {
    static let base = "http://127.0.0.1:6677"

    static func state(_ done: @escaping (StateView?) -> Void) {
        request("/api/state", method: "GET") { data, status in
            guard status == 200, let data,
                  let s = try? JSONDecoder().decode(StateView.self, from: data)
            else {
                done(nil)
                return
            }
            done(s)
        }
    }

    static func refreshUsage(_ done: @escaping (Bool) -> Void) {
        request("/api/usage", method: "POST") { _, status in done(status == 200) }
    }

    /// Returns a problem to show the user, or nil when the switch went through.
    static func switchProfile(_ id: String, _ done: @escaping (String?) -> Void) {
        request("/api/profiles/\(id)/switch", method: "POST") { data, _ in
            guard let data,
                  let res = try? JSONDecoder().decode(SwitchResponse.self, from: data)
            else {
                done("Không gọi được server.")
                return
            }
            if let error = res.error { done(error); return }
            if res.result?.success == false {
                done("Switch thất bại — file cũ đã được khôi phục lại.")
                return
            }
            done(res.refresh?.warning)
        }
    }

    private static func request(
        _ path: String,
        method: String,
        _ done: @escaping (Data?, Int) -> Void
    ) {
        var req = URLRequest(url: URL(string: base + path)!)
        req.httpMethod = method
        req.timeoutInterval = 30
        URLSession.shared.dataTask(with: req) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            DispatchQueue.main.async { done(data, status) }
        }.resume()
    }
}

// MARK: - Dashboard theme (globals.css, mirrored)

enum Theme {
    static let canvas = Color(hex: 0x060A0C)
    static let card = Color(hex: 0x0D1417)
    static let raised = Color(hex: 0x141D21)
    static let line = Color(hex: 0x1A2529)
    static let line2 = Color(hex: 0x27353A)
    static let fg = Color(hex: 0xE9F1F1)
    static let dim = Color(hex: 0x8EA2A5)
    static let faint = Color(hex: 0x5C6F73)
    static let accent = Color(hex: 0x2EE0A0)
    static let info = Color(hex: 0x4FB0E8)
    static let warn = Color(hex: 0xE0B64A)
    static let bad = Color(hex: 0xE0664A)
    static let lime = Color(hex: 0xC8E04A)
}

extension Color {
    init(hex: UInt, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

/// quotaColour on the web: green while healthy, amber past 65%, red past 90%.
func quotaColor(_ used: Double) -> Color {
    if used >= 90 { return Theme.bad }
    if used >= 65 { return Theme.warn }
    return Theme.accent
}

/// avatarTone/initials on the web: a stable colour and two letters per name.
func avatarTone(_ name: String) -> Color {
    let tones = [Theme.accent, Theme.info, Theme.warn, Theme.lime, Theme.bad]
    let sum = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
    return tones[sum % tones.count]
}

func initials(_ name: String) -> String {
    let clean = name.filter { $0.isLetter || $0.isNumber }
    guard let first = clean.first, let last = clean.last else { return "??" }
    return "\(first)\(last)".uppercased()
}

// MARK: - Time helpers

private func parseISO(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
}

/// "2h 11m" / "45m" / "6n 4h" — compact countdown to a quota reset.
private func untilReset(_ iso: String?) -> String? {
    guard let iso, let date = parseISO(iso) else { return nil }
    let left = date.timeIntervalSinceNow
    if left <= 0 { return "đã reset" }
    let mins = Int(left / 60)
    let hours = mins / 60
    let days = hours / 24
    if days >= 1 { return "\(days)n \(hours % 24)h" }
    if hours >= 1 { return "\(hours)h \(mins % 60)m" }
    return "\(mins)m"
}

/// "5 giờ" / "7 ngày" — windowLabel on the web.
private func windowLabel(_ seconds: Double) -> String {
    if seconds <= 0 { return "cửa sổ" }
    let hours = Int((seconds / 3600).rounded())
    if hours < 24 { return "\(hours) giờ" }
    return "\(hours / 24) ngày"
}

/// "đọc 3p trước" — readAge on the web.
private func readAge(_ iso: String) -> String {
    guard let date = parseISO(iso) else { return "" }
    let mins = max(0, Int(-date.timeIntervalSinceNow / 60))
    if mins < 1 { return "vừa đọc xong" }
    if mins < 60 { return "đọc \(mins)p trước" }
    let hours = mins / 60
    if hours < 24 { return "đọc \(hours)h trước" }
    return "đọc \(hours / 24) ngày trước"
}

// MARK: - Shared state

final class Store: ObservableObject {
    @Published var state: StateView?
    @Published var online = false
    @Published var refreshing = false
    /// Profile ids with a switch currently in flight.
    @Published var busy: Set<String> = []
    @Published var problem: String?
}

// MARK: - SwiftUI pieces

struct AvatarView: View {
    let name: String
    var size: CGFloat = 30

    var body: some View {
        let tone = avatarTone(name)
        Text(initials(name))
            .font(.system(size: size * 0.38, weight: .semibold))
            .foregroundStyle(tone)
            .frame(width: size, height: size)
            .background(tone.opacity(0.18))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(tone.opacity(0.3), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

struct PillView: View {
    let text: String
    let tone: Color

    var body: some View {
        Text(text)
            .font(.system(size: 9.5, weight: .medium))
            .foregroundStyle(tone)
            .padding(.horizontal, 7)
            .padding(.vertical, 2.5)
            .background(tone.opacity(0.12))
            .overlay(Capsule().stroke(tone.opacity(0.35), lineWidth: 1))
            .clipShape(Capsule())
    }
}

/// One quota window as label + remaining % + bar + reset, like QuotaBar on the web.
struct QuotaBarView: View {
    let window: UsageWindow
    var compact = false

    private var left: Int { Int((100 - window.usedPercent).rounded()) }
    private var color: Color { quotaColor(window.usedPercent) }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text("quota \(windowLabel(window.windowSeconds))")
                    .font(.system(size: compact ? 8.5 : 9.5))
                    .foregroundStyle(Theme.faint)
                Spacer()
                Text("còn \(left)%")
                    .font(.system(size: compact ? 10 : 11, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(color)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.line)
                    Capsule().fill(color)
                        .frame(width: geo.size.width * CGFloat(max(2, 100 - window.usedPercent)) / 100)
                }
            }
            .frame(height: 4)
            if let reset = untilReset(window.resetAt) {
                Text("reset sau \(reset)")
                    .font(.system(size: compact ? 8.5 : 9.5))
                    .foregroundStyle(Theme.faint)
            }
        }
    }
}

struct CapsuleButton: ButtonStyle {
    var prominent = false
    var tint: Color = Theme.accent

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 11, weight: prominent ? .semibold : .medium))
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                prominent
                    ? tint.opacity(configuration.isPressed ? 0.75 : 1)
                    : Theme.raised.opacity(configuration.isPressed ? 1.6 : 1)
            )
            .foregroundStyle(prominent ? Color(hex: 0x04120C) : Theme.dim)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(prominent ? .clear : Theme.line2, lineWidth: 1))
    }
}

// MARK: - Root view

struct RootView: View {
    @ObservedObject var store: Store
    let onSwitch: (String) -> Void
    let onRepair: () -> Void
    let onRefresh: () -> Void
    let onOpenDashboard: () -> Void
    let onStartServer: () -> Void
    let onQuit: () -> Void

    private var live: Profile? { store.state?.profiles.first(where: { $0.active }) }
    private var backups: [Profile] {
        (store.state?.profiles ?? [])
            .filter { !$0.active }
            .sorted { a, b in
                switch (a.quotaLeft, b.quotaLeft) {
                case let (x?, y?): return x > y
                case (_?, nil): return true
                case (nil, _?): return false
                case (nil, nil): return a.name.localizedCompare(b.name) == .orderedAscending
                }
            }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if let problem = store.problem {
                problemBanner(problem)
            }

            if !store.online {
                offlineBody
            } else {
                if let live { liveHero(live) }
                if !backups.isEmpty { backupList }
            }

            footer
        }
        .padding(12)
        .frame(width: 348)
        .fixedSize(horizontal: false, vertical: true)
        .background(Theme.canvas)
    }

    private var header: some View {
        HStack(spacing: 7) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 12))
                .foregroundStyle(Theme.accent)
            Text("Codex Switch")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.fg)
            Text("quota theo account")
                .font(.system(size: 10.5))
                .foregroundStyle(Theme.faint)
            Spacer()
            Button(action: onRefresh) {
                if store.refreshing {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise").font(.system(size: 12))
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.dim)
            .disabled(store.refreshing)
            .help("Làm mới quota")
            Button(action: onOpenDashboard) {
                Image(systemName: "arrow.up.right.square").font(.system(size: 12))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.dim)
            .help("Mở Dashboard")
        }
    }

    private func problemBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 10))
                .foregroundStyle(Theme.bad)
            Text(text)
                .font(.system(size: 10.5))
                .foregroundStyle(Theme.bad)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
            Button { store.problem = nil } label: {
                Image(systemName: "xmark").font(.system(size: 9))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Theme.faint)
        }
        .padding(8)
        .background(Theme.bad.opacity(0.08))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.bad.opacity(0.35), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func liveHero(_ p: Profile) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                AvatarView(name: p.name, size: 34)
                VStack(alignment: .leading, spacing: 1.5) {
                    Text(p.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.fg)
                        .lineLimit(1)
                    Text(p.identity?.label ?? "—")
                        .font(.system(size: 9.5, design: .monospaced))
                        .foregroundStyle(Theme.dim)
                        .lineLimit(1)
                }
                Spacer()
                if let plan = p.identity?.plan { PillView(text: plan, tone: Theme.accent) }
                PillView(text: "đang dùng", tone: Theme.accent)
            }

            if p.isDead {
                Text(p.usageError?.message ?? "Token bị thu hồi — cần đăng nhập lại.")
                    .font(.system(size: 10.5))
                    .foregroundStyle(Theme.bad)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let usage = p.usage {
                if let primary = usage.primary { QuotaBarView(window: primary) }
                if let secondary = usage.secondary { QuotaBarView(window: secondary) }
                Text(readAge(usage.fetchedAt))
                    .font(.system(size: 9))
                    .foregroundStyle(Theme.faint)
            } else {
                Text("Chưa đọc được quota — bấm nút làm mới ở trên.")
                    .font(.system(size: 10.5))
                    .foregroundStyle(Theme.dim)
            }
        }
        .padding(10)
        .background(Theme.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.accent.opacity(0.3), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var backupList: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("DỰ PHÒNG — XẾP THEO QUOTA")
                .font(.system(size: 8.5, weight: .semibold))
                .foregroundStyle(Theme.faint)
                .tracking(1.2)
                .padding(.bottom, 3)

            ScrollView {
                VStack(spacing: 6) {
                    ForEach(backups, id: \.id) { p in
                        accountRow(p)
                    }
                }
            }
            .frame(maxHeight: 252)
        }
    }

    private func accountRow(_ p: Profile) -> some View {
        HStack(spacing: 8) {
            AvatarView(name: p.name, size: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(p.name)
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(Theme.fg)
                    .lineLimit(1)
                Text(p.identity?.label ?? "—")
                    .font(.system(size: 8.5, design: .monospaced))
                    .foregroundStyle(Theme.faint)
                    .lineLimit(1)
            }
            Spacer()
            if let w = p.mainWindow, !p.isDead {
                QuotaBarView(window: w, compact: true)
                    .frame(width: 92)
            } else if p.isDead {
                Text("token bị thu hồi")
                    .font(.system(size: 9))
                    .foregroundStyle(Theme.bad)
            } else {
                Text("chưa có dữ liệu")
                    .font(.system(size: 9))
                    .foregroundStyle(Theme.faint)
            }

            if store.busy.contains(p.id) {
                ProgressView().controlSize(.small).frame(width: 62)
            } else if p.isDead {
                Button("Đăng nhập lại", action: onRepair)
                    .buttonStyle(CapsuleButton(tint: Theme.warn))
                    .foregroundStyle(Theme.warn)
            } else {
                Button { onSwitch(p.id) } label: {
                    HStack(spacing: 3) {
                        Text("Đổi sang")
                        Image(systemName: "arrow.right").font(.system(size: 9, weight: .semibold))
                    }
                }
                .buttonStyle(CapsuleButton(prominent: true))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(Theme.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var offlineBody: some View {
        VStack(spacing: 8) {
            Image(systemName: "bolt.slash.fill")
                .font(.system(size: 20))
                .foregroundStyle(Theme.warn)
            Text("Không kết nối được dashboard")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.fg)
            Text("Server chưa chạy ở 127.0.0.1:6677")
                .font(.system(size: 10))
                .foregroundStyle(Theme.faint)
            HStack(spacing: 8) {
                Button("Khởi động server", action: onStartServer)
                    .buttonStyle(CapsuleButton(prominent: true))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
    }

    private var footer: some View {
        HStack {
            Text(liveFootnote)
                .font(.system(size: 9))
                .foregroundStyle(Theme.faint)
                .lineLimit(1)
            Spacer()
            Button("Mở Dashboard", action: onOpenDashboard)
                .buttonStyle(CapsuleButton())
            Button("Thoát", action: onQuit)
                .buttonStyle(CapsuleButton())
        }
    }

    private var liveFootnote: String {
        guard let live, let left = live.quotaLeft else { return "" }
        if let reset = untilReset(live.mainWindow?.resetAt) {
            return "\(live.name): còn \(left)% · reset \(reset)"
        }
        return "\(live.name): còn \(left)%"
    }
}

// MARK: - Menu bar app

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let serverLaunchAgent = "local.codexswitch.server"

    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let store = Store()
    private let popover = NSPopover()
    private var hosting: NSHostingController<RootView>?
    private var timers: [Timer] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        let root = RootView(
            store: store,
            onSwitch: { [weak self] id in self?.switchTo(id) },
            onRepair: { [weak self] in self?.openDashboard() },
            onRefresh: { [weak self] in self?.pollUsage() },
            onOpenDashboard: { [weak self] in self?.openDashboard() },
            onStartServer: { [weak self] in self?.startServer() },
            onQuit: { NSApp.terminate(nil) }
        )
        let host = NSHostingController(rootView: root)
        hosting = host
        popover.contentViewController = host
        popover.behavior = .transient
        relayout()

        statusItem.button?.action = #selector(togglePopover)
        statusItem.button?.target = self
        if let img = NSImage(systemSymbolName: "bolt.fill", accessibilityDescription: "Codex Switch") {
            statusItem.button?.image = img
            statusItem.button?.imagePosition = .imageLeft
        }
        statusItem.button?.title = "…"

        pollState()
        // Fresh quota on launch, then on the same cadence the dashboard uses —
        // the bar doubles as the keep-alive agent when the browser is closed.
        pollUsage()
        timers = [
            Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
                self?.pollState()
            },
            Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
                self?.pollUsage()
            }
        ]
    }

    // MARK: Popover

    @objc private func togglePopover() {
        if popover.isShown {
            popover.performClose(nil)
        } else if let button = statusItem.button {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            // Key window, or the SwiftUI buttons inside swallow no clicks.
            NSApp.activate(ignoringOtherApps: true)
            popover.contentViewController?.view.window?.makeKey()
            pollState()
        }
    }

    /// The view decides its own height (fixedSize); copy the fitting size.
    private func relayout() {
        guard let hosting else { return }
        hosting.view.layoutSubtreeIfNeeded()
        popover.contentSize = hosting.view.fittingSize
    }

    // MARK: Polling

    private func pollState() {
        Server.state { [weak self] s in
            guard let self else { return }
            self.store.online = s != nil
            if let s { self.store.state = s }
            self.updateTitle()
            // Let SwiftUI settle before measuring the new content height.
            DispatchQueue.main.async { self.relayout() }
        }
    }

    private func pollUsage() {
        store.refreshing = true
        Server.refreshUsage { [weak self] _ in
            self?.store.refreshing = false
            self?.pollState()
        }
    }

    private func updateTitle() {
        let live = store.state?.profiles.first(where: { $0.active })
        if !store.online {
            statusItem.button?.title = "⚠︎"
        } else if let live {
            statusItem.button?.title = live.quotaLeft.map { "\($0)%" } ?? "—"
        } else {
            statusItem.button?.title = "?"
        }
    }

    // MARK: Actions

    private func switchTo(_ id: String) {
        store.busy.insert(id)
        Server.switchProfile(id) { [weak self] problem in
            guard let self else { return }
            self.store.busy.remove(id)
            if let problem { self.store.problem = problem }
            self.pollState()
        }
    }

    private func openDashboard() {
        NSWorkspace.shared.open(URL(string: Server.base)!)
    }

    private func startServer() {
        // The production server is managed by launchd. Kick the same service
        // instead of starting a second dev server that could fight for port 6677.
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        p.arguments = [
            "kickstart",
            "-k",
            "gui/\(getuid())/\(serverLaunchAgent)"
        ]
        try? p.run()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
