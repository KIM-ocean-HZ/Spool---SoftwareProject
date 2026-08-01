// z-order probe: normal-level on-screen windows, front to back.
// Owner name + pid only — no window titles, so no Screen Recording grant needed.
#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
int main(void) {
  CFArrayRef list = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (!list) { printf("(no window list)\n"); return 1; }
  CFIndex n = CFArrayGetCount(list);
  int rank = 0;
  for (CFIndex i = 0; i < n; i++) {
    CFDictionaryRef d = CFArrayGetValueAtIndex(list, i);
    CFNumberRef layern = CFDictionaryGetValue(d, kCGWindowLayer);
    int layer = 0;
    if (layern) CFNumberGetValue(layern, kCFNumberIntType, &layer);
    if (layer != 0) continue;
    CFNumberRef pidn = CFDictionaryGetValue(d, kCGWindowOwnerPID);
    int pid = 0;
    if (pidn) CFNumberGetValue(pidn, kCFNumberIntType, &pid);
    CFStringRef owner = CFDictionaryGetValue(d, kCGWindowOwnerName);
    char buf[256] = "?";
    if (owner) CFStringGetCString(owner, buf, sizeof buf, kCFStringEncodingUTF8);
    printf("%2d  pid=%-7d %s\n", rank++, pid, buf);
  }
  CFRelease(list);
  return 0;
}
