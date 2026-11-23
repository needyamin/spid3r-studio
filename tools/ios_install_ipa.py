#!/usr/bin/env python3
"""Upload and install an .ipa onto a connected iOS device using 16 KB AFC chunks.

Uses paced 16384-byte chunks over libimobiledevice-1.0.so.6 so WSL2 usbipd + usbmuxd
never hits the 65536 > 65535 asyncReadComplete USB packet abort bug.
"""

import argparse
import ctypes
import os
import subprocess
import sys
import threading
import time


def detect_udid() -> bytes:
    out = subprocess.check_output(["idevice_id", "-l"], text=True, timeout=8)
    for line in out.splitlines():
        u = line.strip()
        if u:
            return u.encode("utf-8")
    raise RuntimeError("No connected iOS device found via idevice_id -l")


def install_ipa(ipa_path: str, udid_arg: str = "") -> int:
    if not os.path.isfile(ipa_path):
        print(f"error: IPA file not found: {ipa_path}", file=sys.stderr)
        return 2

    udid = udid_arg.encode("utf-8") if udid_arg else detect_udid()
    remote_name = os.path.basename(ipa_path)
    remote_dir = b"PublicStaging"
    remote_ipa = ("PublicStaging/" + remote_name).encode("utf-8")
    chunk_size = 16384

    libi = ctypes.CDLL("libimobiledevice-1.0.so.6")
    libp = ctypes.CDLL("libplist-2.0.so.4")

    c_void_p = ctypes.c_void_p
    c_char_p = ctypes.c_char_p
    c_int = ctypes.c_int
    c_uint32 = ctypes.c_uint32
    c_uint64 = ctypes.c_uint64
    POINTER = ctypes.POINTER

    libi.idevice_new.argtypes = [POINTER(c_void_p), c_char_p]
    libi.idevice_new.restype = c_int
    libi.idevice_free.argtypes = [c_void_p]

    libi.lockdownd_client_new_with_handshake.argtypes = [c_void_p, POINTER(c_void_p), c_char_p]
    libi.lockdownd_client_new_with_handshake.restype = c_int
    libi.lockdownd_start_service.argtypes = [c_void_p, c_char_p, POINTER(c_void_p)]
    libi.lockdownd_start_service.restype = c_int
    libi.lockdownd_service_descriptor_free.argtypes = [c_void_p]
    libi.lockdownd_client_free.argtypes = [c_void_p]

    libi.afc_client_new.argtypes = [c_void_p, c_void_p, POINTER(c_void_p)]
    libi.afc_client_new.restype = c_int
    libi.afc_make_directory.argtypes = [c_void_p, c_char_p]
    libi.afc_make_directory.restype = c_int
    libi.afc_file_open.argtypes = [c_void_p, c_char_p, c_int, POINTER(c_uint64)]
    libi.afc_file_open.restype = c_int
    libi.afc_file_write.argtypes = [c_void_p, c_uint64, c_char_p, c_uint32, POINTER(c_uint32)]
    libi.afc_file_write.restype = c_int
    libi.afc_file_close.argtypes = [c_void_p, c_uint64]
    libi.afc_client_free.argtypes = [c_void_p]

    libi.instproxy_client_new.argtypes = [c_void_p, c_void_p, POINTER(c_void_p)]
    libi.instproxy_client_new.restype = c_int
    libi.instproxy_client_options_new.argtypes = []
    libi.instproxy_client_options_new.restype = c_void_p
    libi.instproxy_client_options_free.argtypes = [c_void_p]
    cb_type = ctypes.CFUNCTYPE(None, c_void_p, c_void_p, c_void_p)
    libi.instproxy_install.argtypes = [c_void_p, c_char_p, c_void_p, cb_type, c_void_p]
    libi.instproxy_install.restype = c_int
    libi.instproxy_client_free.argtypes = [c_void_p]

    libp.plist_dict_get_item.argtypes = [c_void_p, c_char_p]
    libp.plist_dict_get_item.restype = c_void_p
    libp.plist_get_string_val.argtypes = [c_void_p, POINTER(c_char_p)]
    libp.plist_get_uint_val.argtypes = [c_void_p, POINTER(c_uint64)]

    def plist_str(d, key):
        if not d:
            return None
        item = libp.plist_dict_get_item(d, key)
        if not item:
            return None
        s = c_char_p()
        libp.plist_get_string_val(item, ctypes.byref(s))
        return s.value.decode("utf-8", "replace") if s.value else None

    def plist_uint(d, key):
        if not d:
            return None
        item = libp.plist_dict_get_item(d, key)
        if not item:
            return None
        v = c_uint64()
        libp.plist_get_uint_val(item, ctypes.byref(v))
        return v.value

    dev = c_void_p()
    rc = libi.idevice_new(ctypes.byref(dev), udid)
    if rc != 0:
        print(f"error: idevice_new failed ({rc})", file=sys.stderr)
        return 1

    ld = c_void_p()
    rc = libi.lockdownd_client_new_with_handshake(dev, ctypes.byref(ld), b"appstudio")
    if rc != 0:
        libi.idevice_free(dev)
        print(f"error: lockdownd handshake failed ({rc}) — unlock iPhone & Trust this computer", file=sys.stderr)
        return 1

    afc_svc = c_void_p()
    rc = libi.lockdownd_start_service(ld, b"com.apple.afc", ctypes.byref(afc_svc))
    if rc != 0:
        libi.lockdownd_client_free(ld)
        libi.idevice_free(dev)
        print(f"error: failed to start AFC service ({rc})", file=sys.stderr)
        return 1

    afc = c_void_p()
    rc = libi.afc_client_new(dev, afc_svc, ctypes.byref(afc))
    libi.lockdownd_service_descriptor_free(afc_svc)
    if rc != 0:
        libi.lockdownd_client_free(ld)
        libi.idevice_free(dev)
        print(f"error: afc_client_new failed ({rc})", file=sys.stderr)
        return 1

    libi.afc_make_directory(afc, remote_dir)
    fh = c_uint64()
    rc = libi.afc_file_open(afc, remote_ipa, 3, ctypes.byref(fh))
    if rc != 0:
        libi.afc_client_free(afc)
        libi.lockdownd_client_free(ld)
        libi.idevice_free(dev)
        print(f"error: afc_file_open failed ({rc})", file=sys.stderr)
        return 1

    total = 0
    chunks = 0
    print(f"Uploading {remote_name} -> {udid.decode()} (16 KB chunks)...", flush=True)
    with open(ipa_path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            written = c_uint32()
            rc = libi.afc_file_write(afc, fh, chunk, len(chunk), ctypes.byref(written))
            if rc != 0 or written.value != len(chunk):
                libi.afc_file_close(afc, fh)
                libi.afc_client_free(afc)
                libi.lockdownd_client_free(ld)
                libi.idevice_free(dev)
                print(f"error: afc_file_write failed (rc={rc}, wrote={written.value}/{len(chunk)})", file=sys.stderr)
                return 1
            total += written.value
            chunks += 1
            if chunks % 64 == 0:
                print(f"  uploaded {total / (1024 * 1024):.2f} MB...", flush=True)
            time.sleep(0.002)

    libi.afc_file_close(afc, fh)
    libi.afc_client_free(afc)
    print(f"Upload complete: {total} bytes ({chunks} chunks)", flush=True)

    ip_svc = c_void_p()
    rc = libi.lockdownd_start_service(ld, b"com.apple.mobile.installation_proxy", ctypes.byref(ip_svc))
    if rc != 0:
        libi.lockdownd_client_free(ld)
        libi.idevice_free(dev)
        print(f"error: failed to start installation_proxy ({rc})", file=sys.stderr)
        return 1

    ip = c_void_p()
    rc = libi.instproxy_client_new(dev, ip_svc, ctypes.byref(ip))
    libi.lockdownd_service_descriptor_free(ip_svc)
    libi.lockdownd_client_free(ld)
    if rc != 0:
        libi.idevice_free(dev)
        print(f"error: instproxy_client_new failed ({rc})", file=sys.stderr)
        return 1

    opts = libi.instproxy_client_options_new()
    done_ev = threading.Event()
    err_box = [None]

    @cb_type
    def on_status(_cmd, status, _ud):
        st = plist_str(status, b"Status")
        pct = plist_uint(status, b"PercentComplete")
        err = plist_str(status, b"Error")
        desc = plist_str(status, b"ErrorDescription")
        if pct is not None:
            print(f"[{pct:3d}%] {st}", flush=True)
        elif st:
            print(f"[done] {st}", flush=True)
        if err:
            err_box[0] = f"{err}: {desc}" if desc else err
            done_ev.set()
        elif st == "Complete":
            done_ev.set()

    rc = libi.instproxy_install(ip, remote_ipa, opts, on_status, None)
    if rc != 0:
        libi.instproxy_client_options_free(opts)
        libi.instproxy_client_free(ip)
        libi.idevice_free(dev)
        print(f"error: instproxy_install failed ({rc})", file=sys.stderr)
        return 1

    if not done_ev.wait(120):
        print("error: timed out waiting for iOS installation", file=sys.stderr)
        return 2

    libi.instproxy_client_options_free(opts)
    libi.instproxy_client_free(ip)
    libi.idevice_free(dev)

    if err_box[0]:
        print(f"error: installation failed: {err_box[0]}", file=sys.stderr)
        return 1

    print("Installed successfully on iPhone.", flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Install .ipa on iPhone via 16 KB chunked AFC")
    parser.add_argument("ipa", help="Path to signed .ipa file")
    parser.add_argument("--udid", default="", help="Target device UDID (optional)")
    args = parser.parse_args()
    return install_ipa(args.ipa, args.udid)


if __name__ == "__main__":
    sys.exit(main())
