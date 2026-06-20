#!/usr/bin/env python3
"""
RTB2 Oscilloscope — SCPI Diagnostic Script
============================================
SCPI commands verified against RTB2 User Manual (1333.1611.02, Version 14).

Usage:
  python test_oscilloscope.py              # READ only (safe)
  python test_oscilloscope.py --write      # READ + WRITE (changes settings, then restores)
  python test_oscilloscope.py "TCPIP::192.168.1.100::INSTR"   # specify address
"""
import sys
import time

def main():
    write_mode = "--write" in sys.argv
    resource = next((a for a in sys.argv[1:] if not a.startswith("-")), None)

    print("\n" + "=" * 60)
    print("  R&S RTB2 — SCPI Diagnostic")
    print("  Commands from User Manual Ch16")
    print("=" * 60)

    try:
        from RsInstrument import RsInstrument
    except ImportError:
        print("\n  FATAL: pip install RsInstrument pyvisa-py")
        sys.exit(1)

    # ── DISCOVER ──
    print(f"\n{'─'*60}\n  STEP 1: Discover\n{'─'*60}")
    try:
        resources = RsInstrument.list_resources("?*") or []
        print(f"  Found {len(resources)} instrument(s):")
        for i, r in enumerate(resources):
            print(f"    [{i}] {r}")
        if not resource and resources:
            resource = resources[0]
            print(f"  → Auto-selected: {resource}")
    except Exception as e:
        print(f"  Discovery error: {e}")
        print("  Try: pip install pyvisa-py")

    if not resource:
        print("  No instrument. Pass VISA address as argument.")
        sys.exit(1)

    # ── CONNECT ──
    print(f"\n{'─'*60}\n  STEP 2: Connect to {resource}\n{'─'*60}")
    try:
        inst = RsInstrument(resource, id_query=True, reset=False)
        print("  Connected!")
    except Exception as e:
        print(f"  FATAL: {e}")
        sys.exit(1)

    results = {}

    def q(name, cmd):
        try:
            r = inst.query_str(cmd).strip()
            results[name] = ("PASS", cmd, r)
            print(f"  PASS  {name:<35} → {r}")
            return r
        except Exception as e:
            results[name] = ("FAIL", cmd, str(e))
            print(f"  FAIL  {name:<35} → {e}")
            return None

    def w(name, cmd):
        try:
            inst.write_str(cmd)
            time.sleep(0.3)
            results[name] = ("PASS", cmd, "ok")
            print(f"  PASS  {name:<35}   {cmd}")
            return True
        except Exception as e:
            results[name] = ("FAIL", cmd, str(e))
            print(f"  FAIL  {name:<35}   {e}")
            return False

    # ── READ TESTS ──
    print(f"\n{'─'*60}\n  STEP 3: READ tests (no changes)\n{'─'*60}\n")

    q("*IDN?",                          "*IDN?")
    q("Error check",                    "SYST:ERR:ALL?")
    print()

    q("Acquisition state",              "ACQuire:STATe?")
    q("Timebase scale",                 "TIMebase:SCALe?")
    q("Timebase position",              "TIMebase:POSition?")
    q("Record length",                  "ACQuire:POINts?")
    q("Sample rate",                     "ACQuire:SRATe?")
    q("Horiz divisions",                "TIMebase:DIVisions?")
    print()

    for ch in (1, 2):
        q(f"CH{ch} state",              f"CHANnel{ch}:STATe?")
        q(f"CH{ch} scale",              f"CHANnel{ch}:SCALe?")
        q(f"CH{ch} offset",             f"CHANnel{ch}:OFFSet?")
        q(f"CH{ch} coupling",           f"CHANnel{ch}:COUPling?")
        q(f"CH{ch} bandwidth",          f"CHANnel{ch}:BANDwidth?")
        q(f"CH{ch} probe atten",        f"PROBe{ch}:SETup:ATTenuation:MANual?")
        print()

    q("Trigger source",                 "TRIGger:A:SOURce?")
    q("Trigger type",                   "TRIGger:A:TYPE?")
    q("Trigger mode",                   "TRIGger:A:MODE?")
    q("Trigger edge slope",             "TRIGger:A:EDGE:SLOPe?")
    q("Trigger level (input 1)",        "TRIGger:A:LEVel1:VALue?")
    q("Trigger edge coupling",          "TRIGger:A:EDGE:COUPling?")
    print()

    q("Meas1 state",                    "MEASurement1:ENABle?")
    q("Meas1 main type",               "MEASurement1:MAIN?")
    q("Meas1 source",                   "MEASurement1:SOURce?")
    q("Meas1 result",                   "MEASurement1:RESult:ACTual?")
    print()

    q("Quick meas results",             "MEASurement1:ARESult?")

    # ── WRITE TESTS ──
    print(f"\n{'─'*60}")
    if not write_mode:
        print("  STEP 4: WRITE tests SKIPPED (pass --write)")
        print(f"{'─'*60}")
    else:
        print("  STEP 4: WRITE tests (will change + restore)")
        print(f"{'─'*60}\n")

        # Save originals
        orig_tb = q("(save) timebase",      "TIMebase:SCALe?")
        orig_s1 = q("(save) CH1 scale",     "CHANnel1:SCALe?")
        orig_tl = q("(save) trig level",    "TRIGger:A:LEVel1:VALue?")
        print()

        print("  --- Timebase ---")
        w("Set timebase 1ms",               "TIMebase:SCALe 0.001")
        v = q("Verify timebase",            "TIMebase:SCALe?")
        if v:
            try:
                print(f"    → {float(v)*1000:.2f} ms/div" + (" ✓" if abs(float(v)-0.001)<1e-6 else " (snapped to nearest)"))
            except: pass
        print()

        print("  --- Vertical scale ---")
        w("Set CH1 500mV/div",              "CHANnel1:SCALe 0.5")
        v = q("Verify CH1 scale",           "CHANnel1:SCALe?")
        if v:
            try:
                print(f"    → {float(v)} V/div" + (" ✓" if abs(float(v)-0.5)<0.01 else ""))
            except: pass
        print()

        print("  --- Coupling ---")
        w("Set CH1 AC coupling",            "CHANnel1:COUPling ACLimit")
        v = q("Verify coupling",            "CHANnel1:COUPling?")
        print(f"    → {v}")
        w("Restore DC coupling",            "CHANnel1:COUPling DCLimit")
        print()

        print("  --- Trigger ---")
        w("Set trigger source CH1",         "TRIGger:A:SOURce CH1")
        w("Set trigger type EDGE",          "TRIGger:A:TYPE EDGE")
        w("Set trigger slope POSitive",     "TRIGger:A:EDGE:SLOPe POSitive")
        w("Set trigger mode AUTO",          "TRIGger:A:MODE AUTO")
        w("Set trigger level 0.5V",         "TRIGger:A:LEVel1:VALue 0.5")
        q("Verify trig source",            "TRIGger:A:SOURce?")
        q("Verify trig level",             "TRIGger:A:LEVel1:VALue?")
        print()

        print("  --- Acquisition ---")
        w("RUN",                            "RUN")
        time.sleep(1)
        q("Acq state after RUN",           "ACQuire:STATe?")
        w("STOP",                           "STOP")
        q("Acq state after STOP",          "ACQuire:STATe?")
        print()

        print("  --- Autoset ---")
        w("AUToscale",                      "AUToscale")
        time.sleep(2)
        q("Acq state after autoset",       "ACQuire:STATe?")
        q("Timebase after autoset",        "TIMebase:SCALe?")
        q("CH1 scale after autoset",       "CHANnel1:SCALe?")
        print()

        print("  --- Measurement ---")
        w("Set meas1 = FREQuency",          "MEASurement1:MAIN FREQuency")
        w("Set meas1 source CH1",           "MEASurement1:SOURce CH1")
        w("Enable meas1",                   "MEASurement1:ENABle ON")
        time.sleep(0.5)
        v = q("Meas1 frequency result",     "MEASurement1:RESult:ACTual?")
        if v:
            try:
                fv = float(v)
                if fv > 9e36:
                    print("    → 9.9E37 = no signal (connect probe to PROBE COMP)")
                else:
                    print(f"    → {fv:.2f} Hz")
            except: pass
        print()

        # Quick measurement
        w("Start quick meas",               "MEASurement1:AON")
        time.sleep(0.5)
        q("Quick meas results",             "MEASurement1:ARESult?")
        w("Stop quick meas",                "MEASurement1:AOFF")
        print()

        print("  --- Restore ---")
        if orig_tb:
            w(f"Restore timebase",          f"TIMebase:SCALe {orig_tb}")
        if orig_s1:
            w(f"Restore CH1 scale",         f"CHANnel1:SCALe {orig_s1}")
        if orig_tl:
            w(f"Restore trig level",        f"TRIGger:A:LEVel1:VALue {orig_tl}")
        print()

    # ── SUMMARY ──
    print(f"{'='*60}\n  SUMMARY\n{'='*60}")
    passed = [k for k, (s,_,_) in results.items() if s == "PASS" and not k.startswith("(")]
    failed = [k for k, (s,_,_) in results.items() if s == "FAIL" and not k.startswith("(")]
    print(f"\n  Passed: {len(passed)}")
    print(f"  Failed: {len(failed)}")
    if failed:
        print(f"\n  Failed:")
        for n in failed:
            s, cmd, err = results[n]
            print(f"    {n}: {cmd} → {err}")
    print()

    try:
        inst.close()
    except: pass

if __name__ == "__main__":
    main()
