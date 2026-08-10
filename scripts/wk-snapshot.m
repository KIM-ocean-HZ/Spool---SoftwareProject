// Render an HTML file in WKWebView and write a PNG of it.
//
// Why this exists: the app runs on WKWebView, and for pixel-level questions — is this digit
// centred, does this ring line up with the text — no other engine may stand in for it. On
// 2026-08-10 the same badge measured 0.5px off in Chrome and 1.5px off here; the Chrome
// number was reported as fixed and the user immediately saw that it was not. WebKit places a
// baseline inside a line box differently, so a measurement taken anywhere else is a
// measurement of a different program.
//
//   cc -fobjc-arc -framework Cocoa -framework WebKit -o /tmp/wk-snapshot scripts/wk-snapshot.m
//   /tmp/wk-snapshot page.html out.png [cssWidth] [cssHeight]
//
// The PNG comes out at the display's backing scale (2x on this machine), so a pixel in the
// file is a device pixel — which is the unit a half-pixel problem lives in. Full recipe,
// including how to colour the parts and measure the ink, is in docs/HANDOFF.md §6.2-sexies.
//
// ⚠️ It renders a FRAGMENT, not the app: no Tauri APIs, no database, no real layout around
// it. It answers "is this shape right", never "does this screen look right".
// ⚠️ Point the page's @font-face at src/assets/fonts/*.ttf and copy the colours from
// src/styles/tokens.css — with the wrong font the metrics, and therefore the answer, change.
// ⚠️ Not part of any build or test. It is a hand tool: compile it when you need it.

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface SnapDelegate : NSObject <WKNavigationDelegate>
@property (nonatomic, strong) NSString *outPath;
@property (nonatomic) CGFloat width, height;
@end

@implementation SnapDelegate
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  // Fonts load asynchronously; snapshotting on didFinish alone catches the fallback face.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.6 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    WKSnapshotConfiguration *cfg = [WKSnapshotConfiguration new];
    cfg.rect = CGRectMake(0, 0, self.width, self.height);
    [webView takeSnapshotWithConfiguration:cfg completionHandler:^(NSImage *image, NSError *error) {
      if (error) { fprintf(stderr, "snapshot failed: %s\n", error.localizedDescription.UTF8String); exit(2); }
      CGImageRef cg = [image CGImageForProposedRect:NULL context:nil hints:nil];
      NSBitmapImageRep *rep = [[NSBitmapImageRep alloc] initWithCGImage:cg];
      NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
      if (![png writeToFile:self.outPath atomically:YES]) {
        fprintf(stderr, "could not write %s\n", self.outPath.UTF8String); exit(3);
      }
      fprintf(stdout, "%s  %lux%lu device px\n", self.outPath.UTF8String,
              (unsigned long)CGImageGetWidth(cg), (unsigned long)CGImageGetHeight(cg));
      exit(0);
    }];
  });
}
@end

int main(int argc, const char **argv) {
  @autoreleasepool {
    if (argc < 3) {
      fprintf(stderr, "usage: wk-snapshot <page.html> <out.png> [cssWidth] [cssHeight]\n");
      return 1;
    }
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];  // no dock icon, no focus steal

    CGFloat w = argc > 3 ? atof(argv[3]) : 420;
    CGFloat h = argc > 4 ? atof(argv[4]) : 400;

    WKWebView *webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, w, h)
                                            configuration:[WKWebViewConfiguration new]];
    // An offscreen window is required: a WKWebView with no window never paints.
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, w, h)
                                                  styleMask:NSWindowStyleMaskBorderless
                                                    backing:NSBackingStoreBuffered
                                                      defer:NO];
    window.contentView = webView;

    SnapDelegate *delegate = [SnapDelegate new];
    delegate.outPath = [NSString stringWithUTF8String:argv[2]];
    delegate.width = w;
    delegate.height = h;
    webView.navigationDelegate = delegate;

    NSURL *page = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
    [webView loadFileURL:page allowingReadAccessToURL:[NSURL fileURLWithPath:@"/"]];
    [NSApp run];
  }
  return 0;
}
