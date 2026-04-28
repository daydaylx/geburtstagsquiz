#!/usr/bin/env python3
import tkinter as tk
from tkinter import ttk, messagebox
import qrcode
from PIL import ImageTk, Image
import subprocess
import os
import signal
import sys
import threading
import time
import queue

# --- Konfiguration ---
DOMAIN = "quiz.disaai.de"
TUNNEL_NAME = "quiz"
SERVICES = [
    {"name": "Server", "cmd": "corepack pnpm --filter @quiz/server dev", "url": f"wss://api.{DOMAIN}"},
    {"name": "TV-Display", "cmd": "corepack pnpm --filter @quiz/web-display dev -- --port 5175 --strictPort", "url": f"https://tv.{DOMAIN}"},
    {"name": "Host-UI", "cmd": "corepack pnpm --filter @quiz/web-host dev -- --port 5173 --strictPort", "url": f"https://host.{DOMAIN}"},
    {"name": "Player-UI", "cmd": "corepack pnpm --filter @quiz/web-player dev -- --port 5174 --strictPort", "url": f"https://play.{DOMAIN}"},
]

class QuizGui:
    def __init__(self, root):
        self.root = root
        self.root.title("Geburtstagsquiz - Domain Control Center")
        self.root.geometry("900x700")
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

        self.processes = []
        self.is_running = True
        self.log_queue = queue.Queue()

        self.setup_ui()
        self.check_queue()
        
        # Starten in einem separaten Thread, damit die GUI sofort da ist
        threading.Thread(target=self.start_all, daemon=True).start()

    def setup_ui(self):
        # Header
        header = ttk.Label(self.root, text="Geburtstagsquiz - Live-Betrieb", font=("Helvetica", 16, "bold"))
        header.pack(pady=10)

        # QR Code Container
        qr_container = ttk.Frame(self.root)
        qr_container.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        # TV QR
        self.create_qr_widget(qr_container, "TV / Display", f"https://tv.{DOMAIN}", 0)
        # Host QR
        self.create_qr_widget(qr_container, "Host / Admin", f"https://host.{DOMAIN}", 1)
        # Player QR
        self.create_qr_widget(qr_container, "Player / Mitspieler", f"https://play.{DOMAIN}", 2)

        # Status Bereich
        status_frame = ttk.LabelFrame(self.root, text="Status & Logs")
        status_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        self.log_text = tk.Text(status_frame, height=10, state='disabled', font=("Monospace", 9))
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Footer
        footer = ttk.Frame(self.root)
        footer.pack(fill=tk.X, pady=10)
        
        self.stop_btn = ttk.Button(footer, text="Alles Stoppen & Beenden", command=self.on_closing)
        self.stop_btn.pack()

    def create_qr_widget(self, parent, label_text, url, column):
        frame = ttk.Frame(parent)
        frame.grid(row=0, column=column, padx=20, pady=10, sticky="n")

        ttk.Label(frame, text=label_text, font=("Helvetica", 11, "bold")).pack()
        
        qr = qrcode.QRCode(version=1, box_size=6, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        photo = ImageTk.PhotoImage(img)
        lbl = ttk.Label(frame, image=photo)
        lbl.image = photo 
        lbl.pack(pady=5)
        
        ttk.Label(frame, text=url, font=("Helvetica", 8), foreground="blue").pack()

    def log(self, message):
        self.log_queue.put(message)

    def check_queue(self):
        try:
            while True:
                msg = self.log_queue.get_nowait()
                self._do_log(msg)
        except queue.Empty:
            pass
        if self.is_running:
            self.root.after(100, self.check_queue)

    def _do_log(self, message):
        self.log_text.configure(state='normal')
        self.log_text.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {message}\n")
        self.log_text.see(tk.END)
        self.log_text.configure(state='disabled')

    def start_all(self):
        env = os.environ.copy()
        
        self.log("Bereinige Ports (3001, 5173, 5174, 5175)...")
        try:
            subprocess.run(["fuser", "-k", "3001/tcp", "5173/tcp", "5174/tcp", "5175/tcp"], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass
        time.sleep(1)

        if os.path.exists(".env.production"):
            with open(".env.production", "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        env[key] = value

        self.log("Starte Dienste...")
        for svc in SERVICES:
            try:
                p = subprocess.Popen(svc["cmd"].split(), 
                                   stdout=subprocess.PIPE, 
                                   stderr=subprocess.STDOUT, 
                                   env=env,
                                   text=True,
                                   bufsize=1)
                self.processes.append((svc["name"], p))
                threading.Thread(target=self.pipe_output, args=(svc["name"], p), daemon=True).start()
            except Exception as e:
                self.log(f"Fehler beim Starten von {svc['name']}: {e}")

        self.log(f"Starte Tunnel '{TUNNEL_NAME}'...")
        try:
            config_path = os.path.join(os.getcwd(), ".cloudflared", "config.yml")
            cmd = ["cloudflared", "tunnel", "--config", config_path, "run", TUNNEL_NAME]
            if not os.path.exists(config_path):
                self.log(f"WARNUNG: Tunnel-Config nicht gefunden unter {config_path}")
                cmd = ["cloudflared", "tunnel", "run", TUNNEL_NAME] # Fallback
            
            tp = subprocess.Popen(cmd,
                                stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT,
                                env=env,
                                text=True,
                                bufsize=1)
            self.processes.append(("Tunnel", tp))
            threading.Thread(target=self.pipe_output, args=("Tunnel", tp), daemon=True).start()
        except Exception as e:
            self.log(f"Fehler beim Starten des Tunnels: {e}")

    def pipe_output(self, name, process):
        try:
            for line in iter(process.stdout.readline, ""):
                if not self.is_running: break
                line = line.strip()
                if any(x in line.lower() for x in ["ready", "started", "connected", "error", "inf", "failed", "wrn"]):
                    self.log(f"{name}: {line}")
            process.stdout.close()
        except:
            pass

    def on_closing(self):
        self.is_running = False
        self.log("Stoppe alle Prozesse...")
        for name, p in self.processes:
            try:
                p.terminate()
            except:
                pass
        
        time.sleep(1)
        for name, p in self.processes:
            if p.poll() is None:
                try:
                    p.kill()
                except:
                    pass
        
        self.root.destroy()
        sys.exit(0)

if __name__ == "__main__":
    try:
        root = tk.Tk()
        app = QuizGui(root)
        root.mainloop()
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        sys.exit(1)
