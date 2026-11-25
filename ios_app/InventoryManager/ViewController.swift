import UIKit
import WebKit

private final class LocalWebAppSchemeHandler: NSObject, WKURLSchemeHandler {
    private let rootDir: URL

    init(rootDir: URL) {
        self.rootDir = rootDir
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: "InventoryManager", code: 400))
            return
        }

        var path = url.path
        if path.isEmpty || path == "/" {
            path = "/index.html"
        }
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let targetUrl = rootDir.appendingPathComponent(relative).standardizedFileURL

        guard targetUrl.path.hasPrefix(rootDir.standardizedFileURL.path),
              FileManager.default.fileExists(atPath: targetUrl.path),
              let data = try? Data(contentsOf: targetUrl) else {
            let notFound = HTTPURLResponse(
                url: url,
                statusCode: 404,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "text/plain"]
            )!
            urlSchemeTask.didReceive(notFound)
            urlSchemeTask.didReceive(Data("Not Found".utf8))
            urlSchemeTask.didFinish()
            return
        }

        let mime = Self.mimeType(for: targetUrl.pathExtension.lowercased())
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mime,
                "Content-Length": "\(data.count)",
                "Cache-Control": "no-cache",
            ]
        )!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private static func mimeType(for ext: String) -> String {
        switch ext {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}

final class ViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView!

    override var preferredStatusBarStyle: UIStatusBarStyle {
        .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let darkBg = UIColor(red: 11/255, green: 14/255, blue: 20/255, alpha: 1)
        view.backgroundColor = darkBg

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = .default()

        let contentController = WKUserContentController()
        contentController.add(self, name: "haptic")
        contentController.add(self, name: "shareTextFile")
        config.userContentController = contentController

        if let webAppDir = Bundle.main.resourceURL?.appendingPathComponent("WebApp") {
            let handler = LocalWebAppSchemeHandler(rootDir: webAppDir)
            config.setURLSchemeHandler(handler, forURLScheme: "imapp")
        }

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = darkBg
        webView.scrollView.backgroundColor = darkBg
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        if let entryUrl = URL(string: "imapp://localhost/index.html") {
            webView.load(URLRequest(url: entryUrl))
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url,
           url.scheme == "http" || url.scheme == "https",
           navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        if message.name == "haptic" {
            let style = (message.body as? String) ?? "light"
            DispatchQueue.main.async {
                if style == "success" {
                    let gen = UINotificationFeedbackGenerator()
                    gen.notificationOccurred(.success)
                } else {
                    let gen = UIImpactFeedbackGenerator(
                        style: style == "medium" ? .medium : .light
                    )
                    gen.impactOccurred()
                }
            }
            return
        }

        if message.name == "shareTextFile",
           let dict = message.body as? [String: Any],
           let filename = dict["filename"] as? String,
           let content = dict["content"] as? String {
            DispatchQueue.main.async {
                let safeName = filename.replacingOccurrences(of: "/", with: "_")
                let fileUrl = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
                do {
                    try content.write(to: fileUrl, atomically: true, encoding: .utf8)
                    let activity = UIActivityViewController(
                        activityItems: [fileUrl],
                        applicationActivities: nil
                    )
                    if let popover = activity.popoverPresentationController {
                        popover.sourceView = self.view
                        popover.sourceRect = CGRect(
                            x: self.view.bounds.midX,
                            y: self.view.bounds.midY,
                            width: 1,
                            height: 1
                        )
                    }
                    self.present(activity, animated: true)
                } catch {
                    // Ignore file export errors
                }
            }
        }
    }
}
