//! Calendar time for the MCP server, split by what actually needs the operating system.
//!
//! ⚠️ Why this file exists: `mcp.rs` used to reach straight for `libc::localtime_r`,
//! `gmtime_r`, `timegm` and `mktime`. Three of those are Unix extensions with no
//! declaration in libc's Windows module, so the MCP server — the whole point of the
//! product's AI side — could not be compiled for Windows at all
//! (INVESTIGATION_WINDOWS_PORT §2.1).
//!
//! The split is deliberate and it is the smaller half that talks to the OS:
//!
//! - **UTC ↔ civil is pure arithmetic** and lives here in Rust for every platform. It is
//!   the same answer everywhere by construction, and — the part that matters for a port
//!   nobody can run locally — it is unit-testable on the development Mac.
//! - **Local time needs the OS**, because only the OS knows the machine's zone and its
//!   DST rules. That is the one thing behind a `cfg`: `localtime_r`/`mktime` on Unix,
//!   `_localtime64_s`/`_mktime64` from the UCRT on Windows.
//!
//! ⭐ This follows the lesson from the follow-up fingerprint (HANDOFF §8.4 #1): when a
//! value has to come out identical on two platforms, pick the algorithm dumb enough that
//! it cannot drift, rather than the clever one only one side can express.

/// A civil date-time, in whatever zone the producer says it is in.
///
/// Fields are the way humans write them — full year, month 1-12 — not the way `struct tm`
/// stores them. The `+1900` / `+1` dance was open-coded at every call site in `mcp.rs`,
/// which is one subtraction away from a wrong year in a pack.
///
/// `mday` may be out of range on the way IN to [`epoch_ms_from_local`]: that is how the
/// digest window walks backwards N days across a DST boundary without doing arithmetic on
/// seconds. Both `mktime` and `_mktime64` normalise it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Civil {
    pub year: i32,
    pub mon: i32,
    pub mday: i32,
    pub hour: i32,
    pub min: i32,
    pub sec: i32,
}

// What a failed conversion reads as. `localtime_r` returns null and leaves the caller's
// zeroed `struct tm` alone, which spells 1900-01-00; keep exactly that so a failure looks
// the same on both platforms instead of inventing a second wrong answer. Unreachable for
// the timestamps this product stores (all post-1970, all this century).
const CONVERSION_FAILED: Civil =
    Civil { year: 1900, mon: 1, mday: 0, hour: 0, min: 0, sec: 0 };

// ---------------------------------------------------------------------------------------
// UTC — no operating system involved
// ---------------------------------------------------------------------------------------

/// Days since 1970-01-01 from a proleptic Gregorian civil date (Howard Hinnant's
/// `days_from_civil`). Linear in `d`, which is what lets [`crate::mcp::parse_iso_date`]
/// keep catching 31 April by round-tripping: day 31 of a 30-day month lands on the same
/// number as day 1 of the next, so the formatted result no longer spells what was typed.
fn days_from_civil(y: i32, m: i32, d: i32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64; // [0, 399]
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp as i64 + 2) / 5 + d as i64 - 1; // [0, 365]
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
    era as i64 * 146097 + doe - 719468
}

/// The inverse of [`days_from_civil`].
fn civil_from_days(z: i64) -> (i32, i32, i32) {
    let z = z + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    ((if m <= 2 { y + 1 } else { y }) as i32, m as i32, d as i32)
}

pub fn utc_from_epoch_ms(epoch_ms: i64) -> Civil {
    let secs = epoch_ms.div_euclid(1000);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (year, mon, mday) = civil_from_days(days);
    Civil {
        year,
        mon,
        mday,
        hour: (rem / 3600) as i32,
        min: (rem % 3600 / 60) as i32,
        sec: (rem % 60) as i32,
    }
}

/// Midnight-agnostic inverse: whatever `hour`/`min`/`sec` say is taken literally.
/// Out-of-range `mday` normalises the same way `timegm` did.
pub fn epoch_ms_from_utc(c: &Civil) -> i64 {
    let days = days_from_civil(c.year, c.mon, c.mday);
    (days * 86_400 + c.hour as i64 * 3600 + c.min as i64 * 60 + c.sec as i64) * 1000
}

// ---------------------------------------------------------------------------------------
// Local — the machine's zone, so the OS answers
// ---------------------------------------------------------------------------------------

#[cfg(unix)]
pub fn local_from_epoch_ms(epoch_ms: i64) -> Civil {
    let secs = epoch_ms.div_euclid(1000) as libc::time_t;
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    let ok = unsafe { !libc::localtime_r(&secs, &mut tm).is_null() };
    if !ok {
        return CONVERSION_FAILED;
    }
    Civil {
        year: tm.tm_year + 1900,
        mon: tm.tm_mon + 1,
        mday: tm.tm_mday,
        hour: tm.tm_hour,
        min: tm.tm_min,
        sec: tm.tm_sec,
    }
}

#[cfg(unix)]
pub fn epoch_ms_from_local(c: &Civil) -> i64 {
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    tm.tm_year = c.year - 1900;
    tm.tm_mon = c.mon - 1;
    tm.tm_mday = c.mday;
    tm.tm_hour = c.hour;
    tm.tm_min = c.min;
    tm.tm_sec = c.sec;
    // -1 = "work out for me whether this civil time is in DST". Without it the hour
    // shifts by one on half the year.
    tm.tm_isdst = -1;
    (unsafe { libc::mktime(&mut tm) } as i64) * 1000
}

// The UCRT's 64-bit time face. `libc` does not declare these, and the `_s` variants take
// their arguments in the opposite order from the Unix `_r` ones (destination first) and
// answer with an errno rather than a pointer — so this is a hand-written binding, not a
// rename. Layout of `struct tm` is fixed C ABI; the trailing `tm_gmtoff`/`tm_zone` that
// glibc and Darwin add do not exist here, which is why this file uses `libc::tm` on Unix
// and its own struct on Windows rather than one shared declaration.
#[cfg(windows)]
#[repr(C)]
struct CrtTm {
    tm_sec: i32,
    tm_min: i32,
    tm_hour: i32,
    tm_mday: i32,
    tm_mon: i32,
    tm_year: i32,
    tm_wday: i32,
    tm_yday: i32,
    tm_isdst: i32,
}

#[cfg(windows)]
extern "C" {
    fn _localtime64_s(dest: *mut CrtTm, time: *const i64) -> i32;
    fn _mktime64(tm: *mut CrtTm) -> i64;
}

#[cfg(windows)]
pub fn local_from_epoch_ms(epoch_ms: i64) -> Civil {
    let secs: i64 = epoch_ms.div_euclid(1000);
    let mut tm: CrtTm = unsafe { std::mem::zeroed() };
    // ⚠️ Unlike localtime_r this refuses anything before 1970 outright (errno EINVAL) and
    // scribbles -1 into every field, so the return value has to be checked rather than
    // trusted — nothing this product stores reaches back that far, but a silent -1 would
    // render as a date rather than as a failure.
    if unsafe { _localtime64_s(&mut tm, &secs) } != 0 {
        return CONVERSION_FAILED;
    }
    Civil {
        year: tm.tm_year + 1900,
        mon: tm.tm_mon + 1,
        mday: tm.tm_mday,
        hour: tm.tm_hour,
        min: tm.tm_min,
        sec: tm.tm_sec,
    }
}

#[cfg(windows)]
pub fn epoch_ms_from_local(c: &Civil) -> i64 {
    let mut tm: CrtTm = unsafe { std::mem::zeroed() };
    tm.tm_year = c.year - 1900;
    tm.tm_mon = c.mon - 1;
    tm.tm_mday = c.mday;
    tm.tm_hour = c.hour;
    tm.tm_min = c.min;
    tm.tm_sec = c.sec;
    tm.tm_isdst = -1;
    (unsafe { _mktime64(&mut tm) }) * 1000
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utc(year: i32, mon: i32, mday: i32, hour: i32, min: i32, sec: i32) -> Civil {
        Civil { year, mon, mday, hour, min, sec }
    }

    // Fixed vectors, not a round trip against itself: a round trip stays green when both
    // directions share the same mistake.
    #[test]
    fn known_utc_instants() {
        assert_eq!(utc_from_epoch_ms(0), utc(1970, 1, 1, 0, 0, 0));
        assert_eq!(utc_from_epoch_ms(1_000_000_000_000), utc(2001, 9, 9, 1, 46, 40));
        // 2000 is a leap year (divisible by 400) — the case the naive rule gets wrong.
        assert_eq!(utc_from_epoch_ms(951_782_400_000), utc(2000, 2, 29, 0, 0, 0));
        assert_eq!(utc_from_epoch_ms(1_755_388_800_000), utc(2025, 8, 17, 0, 0, 0));
        assert_eq!(epoch_ms_from_utc(&utc(1970, 1, 1, 0, 0, 0)), 0);
        assert_eq!(epoch_ms_from_utc(&utc(2001, 9, 9, 1, 46, 40)), 1_000_000_000_000);
        assert_eq!(epoch_ms_from_utc(&utc(2000, 2, 29, 0, 0, 0)), 951_782_400_000);
    }

    #[test]
    fn utc_round_trips_across_a_century() {
        // Every day from 1970 to 2070, one conversion each way.
        let mut days = 0i64;
        while days < 36_525 {
            let ms = days * 86_400_000;
            let c = utc_from_epoch_ms(ms);
            assert_eq!(epoch_ms_from_utc(&c), ms, "day {days}");
            days += 1;
        }
    }

    // The property parse_iso_date leans on: an impossible day does not produce itself back.
    #[test]
    fn overflowing_day_normalises_forward() {
        assert_eq!(utc_from_epoch_ms(epoch_ms_from_utc(&utc(2026, 4, 31, 0, 0, 0))), utc(2026, 5, 1, 0, 0, 0));
        assert_eq!(utc_from_epoch_ms(epoch_ms_from_utc(&utc(2026, 2, 30, 0, 0, 0))), utc(2026, 3, 2, 0, 0, 0));
    }

    // Negative epochs are not something this product stores, but div_euclid vs a plain `/`
    // is the kind of thing that reads correct and truncates towards zero.
    #[test]
    fn pre_epoch_utc_does_not_wrap() {
        assert_eq!(utc_from_epoch_ms(-1), utc(1969, 12, 31, 23, 59, 59));
        assert_eq!(epoch_ms_from_utc(&utc(1969, 12, 31, 23, 59, 59)), -1000);
    }

    // Local time is the machine's, so the vectors have to be relative: the assertion is
    // that the pair is each other's inverse and that midnight is really midnight, not that
    // a particular wall clock reads a particular epoch.
    #[test]
    fn local_midnight_round_trips() {
        for ms in [0_i64, 1_755_388_800_000, 1_766_000_000_000] {
            let mut c = local_from_epoch_ms(ms);
            c.hour = 0;
            c.min = 0;
            c.sec = 0;
            let midnight = epoch_ms_from_local(&c);
            let back = local_from_epoch_ms(midnight);
            assert_eq!((back.year, back.mon, back.mday), (c.year, c.mon, c.mday));
            assert_eq!((back.hour, back.min, back.sec), (0, 0, 0));
        }
    }

    // Walking back on mday is how the digest window is built; a 25-hour DST day must not
    // leave the boundary an hour off, and only the OS knows where those days are.
    #[test]
    fn walking_back_days_lands_on_local_midnight() {
        let now = 1_766_000_000_000_i64;
        for back in [0, 1, 7, 30, 90, 365] {
            let mut c = local_from_epoch_ms(now);
            c.hour = 0;
            c.min = 0;
            c.sec = 0;
            c.mday -= back;
            let start = epoch_ms_from_local(&c);
            let landed = local_from_epoch_ms(start);
            assert_eq!((landed.hour, landed.min, landed.sec), (0, 0, 0), "{back} days back");
            let elapsed_days = (now - start) as f64 / 86_400_000.0;
            assert!(
                (elapsed_days - back as f64).abs() < 1.0,
                "{back} days back drifted to {elapsed_days}"
            );
        }
    }
}
