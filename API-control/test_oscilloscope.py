#!/usr/bin/env python3
"""
RTB24 Oscilloscope — Connection & SCPI Diagnostic Script
=========================================================
Run this BEFORE integrating with the Rhoda backend.
Tests each SCPI command individually and reports what works.

Prerequisites:
  pip install RsInstrument

Usage:
  # Auto-discover USB instrument
  python test_oscilloscope.py

  # Specify VISA address manually
  python test_oscilloscope.py "USB0::0x0AAD::0x01D6::102345::INSTR"
  python test_oscilloscope.py "TCPIP::192.168.1.100::INSTR"

What to expect:
  - Each test prints PASS/FAIL with the actual response from the instrument
  - A summary at the end shows what works and what needs fixing
  - NO settings are changed unless you pass --write to enable write tests
"""

import sys
import time


def main():
    write_enabled = "--write" in sys.argv
    resource = None
    for arg in sys.argv[1:]:
        if not arg.startswith("-"):
            resource = arg
            break

    # ═══════════════════════════════════════════════════════════
    # STEP 0: Check RsInstrument is installed
    # ═══════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    print("  RTB24 Oscilloscope Diagnostic Script")
    print("=" * 60)

    try:
        from RsInstrument import RsInstrument
    except ImportError:
        print("\n  FATAL: RsInstrument not installed")
        print("  Fix:   pip install RsInstrument")
        print("  Also ensure you have a VISA backend:")
        print("         pip install pyvisa-py    (pure Python, no drivers needed)")
        print("    OR   Install R&S VISA from rohde-schwarz.com")
        sys.exit(1)

    print(f"\n  RsInstrument imported successfully")

    # ═══════════════════════════════════════════════════════════
    # STEP 1: Discover instruments
    # ═══════════════════════════════════════════════════════════
    print(f"\n{'─' * 60}")
    print("  STEP 1: Discover VISA instruments")
    print(f"{'─' * 60}")

    try:
        resources = RsInstrument.list_resources("?*")
        if resources:
            print(f"  Found {len(resources)} instrument(s):")
            for i, r in enumerate(resources):
                print(f"    [{i}] {r}")
        else:
            print("  No instruments found.")
            print("  Check:")
            print("    - USB cable is connected")
            print("    - Oscilloscope is powered on")
            print("    - VISA driver is installed (R&S VISA or pyvisa-py)")
            print("    - Try: pip install pyvisa-py")
            if not resource:
                sys.exit(1)
    except Exception as e:
        print(f"  Discovery failed: {e}")
        print("  This usually means no VISA backend is installed.")
        print("  Fix: pip install pyvisa-py")
        if not resource:
            sys.exit(1)

    if not resource:
        if resources:
            resource = resources[0]
            print(f"\n  Auto-selected: {resource}")
        else:
            print("\n  No resource to connect to. Pass the VISA address manually:")
            print('  python test_oscilloscope.py "USB0::0x0AAD::..."')
            sys.exit(1)

    # ═══════════════════════════════════════════════════════════
    # STEP 2: Connect
    # ═══════════════════════════════════════════════════════════
    print(f"\n{'─' * 60}")
    print(f"  STEP 2: Connect to {resource}")
    print(f"{'─' * 60}")

    try:
        inst = RsInstrument(resource, id_query=True, reset=False)
        print(f"  Connected successfully!")
    except Exception as e:
        print(f"  FATAL: Connection failed: {e}")
        sys.exit(1)

    # ═══════════════════════════════════════════════════════════
    # STEP 3: READ tests (safe, no state changes)
    # ═══════════════════════════════════════════════════════════
    print(f"\n{'─' * 60}")
    print("  STEP 3: READ tests (safe — no instrument changes)")
    print(f"{'─' * 60}")

    results = {}

    def test_query(name, cmd, expected_type="string"):
        """Query the instrument and report the result."""
        try:
            raw = inst.query_str(cmd).strip()
            results[name] = {"status": "PASS", "cmd": cmd, "response": raw}
            print(f"  PASS  {name}")
            print(f"        Command:  {cmd}")
            print(f"        Response: {raw}")
            return raw
        except Exception as e:
            results[name] = {"status": "FAIL", "cmd": cmd, "error": str(e)}
            print(f"  FAIL  {name}")
            print(f"        Command:  {cmd}")
            print(f"        Error:    {e}")
            return None

    print()

    # Identity
    idn = test_query("Instrument ID", "*IDN?")
    print()

    # Acquisition state
    test_query("Acquisition state", "ACQuire:STATe?")
    print()

    # Timebase
    test_query("Timebase scale", "TIMebase:SCALe?")
    test_query("Record length", "ACQuire:POINts:VALue?")
    print()

    # Channel 1 state
    test_query("CH1 enabled", "CHANnel1:STATe?")
    test_query("CH1 vertical scale", "CHANnel1:SCALe?")
    test_query("CH1 offset", "CHANnel1:OFFSet?")
    test_query("CH1 coupling", "CHANnel1:COUPling?")
    print()

    # Channel 2 state
    test_query("CH2 enabled", "CHANnel2:STATe?")
    test_query("CH2 vertical scale", "CHANnel2:SCALe?")
    print()

    # Trigger
    test_query("Trigger source", "TRIGger:A:SOURce?")
    test_query("Trigger level", "TRIGger:A:LEVel1:VALue?")
    test_query("Trigger edge slope", "TRIGger:A:EDGE:SLOPe?")
    test_query("Trigger mode", "TRIGger:A:MODE?")
    print()

    # Probe attenuation — try multiple possible commands
    print("  --- Probe attenuation (trying multiple SCPI variants) ---")
    probe_cmds = [
        ("Probe atten (variant 1)", "CHANnel1:PROBe:SETup:ATTenuation:MANual?"),
        ("Probe atten (variant 2)", "CHANnel1:PROBe:SETup:ATTenuation?"),
        ("Probe atten (variant 3)", "CHANnel1:PROBe:ATTenuation?"),
        ("Probe atten (variant 4)", "CHANnel1:PROBe?"),
    ]
    probe_worked = False
    for name, cmd in probe_cmds:
        r = test_query(name, cmd)
        if r is not None:
            probe_worked = True
            print(f"        >>> USE THIS COMMAND for probe attenuation queries <<<")
            break
    if not probe_worked:
        print("        WARNING: No probe attenuation query worked.")
        print("        The instrument may use a different SCPI path.")
    print()

    # Measurements — try reading current measurement
    print("  --- Measurement queries ---")
    meas_cmds = [
        ("Measurement result (variant 1)", "MEASurement1:RESult:ACTual?"),
        ("Measurement result (variant 2)", "MEASurement1:RESult?"),
        ("Measurement result (variant 3)", "MEASurement:RESult?"),
    ]
    meas_worked = False
    for name, cmd in meas_cmds:
        r = test_query(name, cmd)
        if r is not None:
            meas_worked = True
            print(f"        >>> USE THIS COMMAND for measurement reads <<<")
            # Check for NaN (9.9E37 means no valid measurement)
            try:
                val = float(r)
                if val > 9e36:
                    print(f"        NOTE: Value 9.9E37 means no valid signal/measurement active")
                else:
                    print(f"        Measurement value: {val}")
            except ValueError:
                pass
            break
    print()

    # Measurement type configuration
    meas_type_cmds = [
        ("Measurement main type", "MEASurement1:MAIN?"),
        ("Measurement source", "MEASurement1:SOURce?"),
        ("Measurement state", "MEASurement1:STATe?"),
    ]
    for name, cmd in meas_type_cmds:
        test_query(name, cmd)
    print()

    # ═══════════════════════════════════════════════════════════
    # STEP 4: WRITE tests (only if --write flag passed)
    # ═══════════════════════════════════════════════════════════
    print(f"{'─' * 60}")
    if write_enabled:
        print("  STEP 4: WRITE tests (--write enabled, WILL change settings)")
        print(f"{'─' * 60}")
        print()

        def test_write(name, cmd):
            try:
                inst.write_str(cmd)
                time.sleep(0.3)  # Give instrument time to process
                results[name] = {"status": "PASS", "cmd": cmd}
                print(f"  PASS  {name}")
                print(f"        Command: {cmd}")
                return True
            except Exception as e:
                results[name] = {"status": "FAIL", "cmd": cmd, "error": str(e)}
                print(f"  FAIL  {name}")
                print(f"        Command: {cmd}")
                print(f"        Error:   {e}")
                return False

        # Save current state so we can restore
        orig_timebase = test_query("(save) original timebase", "TIMebase:SCALe?")
        orig_ch1_scale = test_query("(save) original CH1 scale", "CHANnel1:SCALe?")
        print()

        # Test timebase write
        print("  --- Testing timebase change ---")
        test_write("Set timebase to 1ms/div", "TIMebase:SCALe 0.001")
        new_tb = test_query("Verify timebase", "TIMebase:SCALe?")
        if new_tb:
            try:
                val = float(new_tb)
                expected = 0.001
                if abs(val - expected) < 1e-6:
                    print(f"        VERIFIED: Timebase is now {val} s/div (1 ms/div)")
                else:
                    print(f"        WARNING: Expected {expected}, got {val}")
                    print(f"        The instrument may have snapped to nearest valid value")
            except ValueError:
                pass
        print()

        # Test vertical scale write
        print("  --- Testing vertical scale change ---")
        test_write("Set CH1 scale to 0.5 V/div", "CHANnel1:SCALe 0.5")
        new_scale = test_query("Verify CH1 scale", "CHANnel1:SCALe?")
        if new_scale:
            try:
                val = float(new_scale)
                if abs(val - 0.5) < 0.01:
                    print(f"        VERIFIED: CH1 scale is now {val} V/div")
                else:
                    print(f"        WARNING: Expected 0.5, got {val}")
            except ValueError:
                pass
        print()

        # Test trigger write
        print("  --- Testing trigger changes ---")
        test_write("Set trigger source CH1", "TRIGger:A:SOURce CH1")
        test_write("Set trigger level 0.5V", "TRIGger:A:LEVel1:VALue 0.5")
        test_write("Set trigger edge rising", "TRIGger:A:EDGE:SLOPe POSitive")
        test_write("Set trigger mode auto", "TRIGger:A:MODE AUTO")
        test_query("Verify trigger source", "TRIGger:A:SOURce?")
        test_query("Verify trigger level", "TRIGger:A:LEVel1:VALue?")
        print()

        # Test RUN/STOP
        print("  --- Testing acquisition control ---")
        test_write("Start acquisition (RUN)", "RUN")
        time.sleep(1)
        acq_state = test_query("Check acquisition state", "ACQuire:STATe?")
        if acq_state:
            print(f"        Acquisition state after RUN: {acq_state}")
        test_write("Stop acquisition (STOP)", "STOP")
        print()

        # Test measurement configuration
        print("  --- Testing measurement setup ---")
        test_write("Set measurement type to frequency", "MEASurement1:MAIN FREQuency")
        test_write("Set measurement source CH1", "MEASurement1:SOURce CH1")
        test_write("Enable measurement", "MEASurement1:STATe ON")
        time.sleep(0.5)
        meas_val = test_query("Read measurement result", "MEASurement1:RESult:ACTual?")
        if meas_val:
            try:
                val = float(meas_val)
                if val > 9e36:
                    print(f"        NOTE: 9.9E37 = no signal. Connect probe to PROBE COMP output")
                else:
                    print(f"        Measured frequency: {val} Hz")
            except ValueError:
                pass
        print()

        # Restore original settings
        print("  --- Restoring original settings ---")
        if orig_timebase:
            test_write(f"Restore timebase to {orig_timebase}", f"TIMebase:SCALe {orig_timebase}")
        if orig_ch1_scale:
            test_write(f"Restore CH1 scale to {orig_ch1_scale}", f"CHANnel1:SCALe {orig_ch1_scale}")
        print()

    else:
        print("  STEP 4: WRITE tests SKIPPED (pass --write to enable)")
        print(f"{'─' * 60}")
        print()
        print("  To test WRITE commands (will change oscilloscope settings):")
        print(f"  python {sys.argv[0]} --write")
        print()

    # ═══════════════════════════════════════════════════════════
    # STEP 5: Summary
    # ═══════════════════════════════════════════════════════════
    print(f"{'═' * 60}")
    print("  SUMMARY")
    print(f"{'═' * 60}")

    passed = [k for k, v in results.items() if v["status"] == "PASS" and not k.startswith("(")]
    failed = [k for k, v in results.items() if v["status"] == "FAIL" and not k.startswith("(")]

    print(f"\n  Passed: {len(passed)}")
    print(f"  Failed: {len(failed)}")

    if failed:
        print(f"\n  Failed commands:")
        for name in failed:
            r = results[name]
            print(f"    - {name}")
            print(f"      Command: {r['cmd']}")
            print(f"      Error:   {r.get('error', 'unknown')}")

    print(f"\n  Instrument: {idn or 'unknown'}")
    print(f"  Resource:   {resource}")

    if not failed:
        print(f"\n  All tests passed! The SCPI commands are compatible.")
        if not write_enabled:
            print(f"  Run with --write to also test setting changes.")
    else:
        print(f"\n  Some commands failed. Check the SCPI syntax for your")
        print(f"  specific RTB24 firmware version. Failed commands may")
        print(f"  need different SCPI paths — check the user manual.")

    print()

    # Disconnect
    try:
        inst.close()
    except Exception:
        pass


if __name__ == "__main__":
    main()
