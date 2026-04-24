#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Quiz Review Tool
- Lädt eine Quiz-JSON
- Zeigt Fragen einzeln an
- Markiert Fragen als: behalten / überarbeiten / entfernen
- Speichert Review-Daten separat in review_state.json
- Kleine Tkinter-UI
- Tastaturkürzel:
    Left / A     -> vorherige Frage
    Right / D    -> nächste Frage
    1            -> behalten
    2            -> überarbeiten
    3            -> entfernen
    Ctrl+S       -> speichern
"""

from __future__ import annotations

import json
import hashlib
import os
import sys
import tkinter as tk
from tkinter import filedialog, messagebox
from tkinter import ttk
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


APP_TITLE = "Quiz Review Tool"
DEFAULT_REVIEW_FILE = "review_state.json"


STATUS_UNMARKED = "unmarkiert"
STATUS_KEEP = "behalten"
STATUS_REWORK = "überarbeiten"
STATUS_REMOVE = "entfernen"

STATUS_VALUES = [
    STATUS_UNMARKED,
    STATUS_KEEP,
    STATUS_REWORK,
    STATUS_REMOVE,
]

FILTER_VALUES = [
    "alle",
    STATUS_UNMARKED,
    STATUS_KEEP,
    STATUS_REWORK,
    STATUS_REMOVE,
]


@dataclass
class QuestionItem:
    question_id: str
    category_id: str
    category_name: str
    question: str
    answer: str
    options: List[str]
    raw: Dict[str, Any]


class QuizLoader:
    @staticmethod
    def _stable_id_from_text(*parts: str) -> str:
        joined = "||".join(p.strip() for p in parts if p is not None)
        digest = hashlib.sha1(joined.encode("utf-8")).hexdigest()
        return f"generated_{digest[:16]}"

    @classmethod
    def _extract_options(cls, question_obj: Dict[str, Any]) -> List[str]:
        options: List[str] = []

        if isinstance(question_obj.get("options"), list):
            for item in question_obj["options"]:
                if isinstance(item, dict):
                    text = item.get("text") or item.get("label") or item.get("value")
                    if text:
                        options.append(str(text))
                elif item is not None:
                    options.append(str(item))

        elif isinstance(question_obj.get("choices"), list):
            for item in question_obj["choices"]:
                if item is not None:
                    options.append(str(item))

        elif isinstance(question_obj.get("multiple_choice"), dict):
            mc = question_obj["multiple_choice"]
            if isinstance(mc.get("options"), list):
                for item in mc["options"]:
                    if isinstance(item, dict):
                        text = item.get("text") or item.get("label") or item.get("value")
                        if text:
                            options.append(str(text))
                    elif item is not None:
                        options.append(str(item))

        return options

    @classmethod
    def _extract_answer(cls, question_obj: Dict[str, Any]) -> str:
        if isinstance(question_obj.get("answer"), str):
            return question_obj["answer"]

        if isinstance(question_obj.get("answer"), dict):
            answer = question_obj["answer"]
            for key in ("canonical", "text", "value"):
                if answer.get(key):
                    return str(answer[key])

        if question_obj.get("correct_answer"):
            return str(question_obj["correct_answer"])

        if question_obj.get("solution"):
            return str(question_obj["solution"])

        return ""

    @classmethod
    def _extract_question_text(cls, question_obj: Dict[str, Any]) -> str:
        for key in ("question", "prompt", "text"):
            value = question_obj.get(key)
            if value:
                return str(value)
        return ""

    @classmethod
    def _extract_question_id(
        cls,
        question_obj: Dict[str, Any],
        category_name: str,
        question_text: str,
        answer_text: str,
    ) -> str:
        for key in ("question_id", "id", "uuid"):
            value = question_obj.get(key)
            if value:
                return str(value)

        return cls._stable_id_from_text(category_name, question_text, answer_text)

    @classmethod
    def _extract_category_id(cls, category_obj: Dict[str, Any], category_name: str) -> str:
        for key in ("category_id", "id", "uuid"):
            value = category_obj.get(key)
            if value:
                return str(value)
        return cls._stable_id_from_text(category_name)

    @classmethod
    def load_questions(cls, path: str) -> List[QuestionItem]:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        categories = data.get("categories")
        if categories is None and "quiz" in data:
            categories = data["quiz"].get("categories")
            
        if not isinstance(categories, list):
            raise ValueError("Ungültiges JSON: Feld 'categories' fehlt oder ist keine Liste.")

        questions: List[QuestionItem] = []

        for category in categories:
            if not isinstance(category, dict):
                continue

            category_name = str(category.get("name") or category.get("title") or "Ohne Kategorie")
            category_id = cls._extract_category_id(category, category_name)

            category_questions = category.get("questions")
            if not isinstance(category_questions, list):
                continue

            for q in category_questions:
                if not isinstance(q, dict):
                    continue

                question_text = cls._extract_question_text(q).strip()
                answer_text = cls._extract_answer(q).strip()
                options = cls._extract_options(q)
                question_id = cls._extract_question_id(q, category_name, question_text, answer_text)

                if not question_text:
                    continue

                questions.append(
                    QuestionItem(
                        question_id=question_id,
                        category_id=category_id,
                        category_name=category_name,
                        question=question_text,
                        answer=answer_text,
                        options=options,
                        raw=q,
                    )
                )

        if not questions:
            raise ValueError("Keine Fragen gefunden. Prüfe die JSON-Struktur.")

        return questions


class ReviewState:
    def __init__(self, path: str):
        self.path = path
        self.data: Dict[str, Any] = {
            "schema_version": 1,
            "items": {}
        }
        self.load()

    def load(self) -> None:
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                self.data = loaded
                self.data.setdefault("schema_version", 1)
                self.data.setdefault("items", {})
        except Exception:
            messagebox.showwarning(
                "Warnung",
                f"Review-Datei konnte nicht sauber geladen werden:\n{self.path}\n\nEs wird mit leerem Zustand weitergearbeitet."
            )

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)

    def get_item(self, question_id: str) -> Dict[str, Any]:
        items = self.data.setdefault("items", {})
        if question_id not in items:
            items[question_id] = {
                "status": STATUS_UNMARKED,
                "note": "",
            }
        return items[question_id]

    def get_status(self, question_id: str) -> str:
        item = self.get_item(question_id)
        status = item.get("status", STATUS_UNMARKED)
        if status not in STATUS_VALUES:
            return STATUS_UNMARKED
        return status

    def set_status(self, question_id: str, status: str) -> None:
        if status not in STATUS_VALUES:
            status = STATUS_UNMARKED
        item = self.get_item(question_id)
        item["status"] = status

    def get_note(self, question_id: str) -> str:
        item = self.get_item(question_id)
        return str(item.get("note", ""))

    def set_note(self, question_id: str, note: str) -> None:
        item = self.get_item(question_id)
        item["note"] = note


class QuizReviewApp(tk.Tk):
    def __init__(self, quiz_path: Optional[str] = None):
        super().__init__()

        self.title(APP_TITLE)
        self.geometry("1000x720")
        self.minsize(860, 620)

        self.quiz_path: Optional[str] = None
        self.review_path: Optional[str] = None

        self.questions: List[QuestionItem] = []
        self.filtered_indices: List[int] = []
        self.current_filtered_pos: int = 0

        self.review_state: Optional[ReviewState] = None

        self.filter_var = tk.StringVar(value="alle")
        self.status_var = tk.StringVar(value=STATUS_UNMARKED)
        self.progress_var = tk.StringVar(value="Keine Datei geladen")
        self.category_var = tk.StringVar(value="-")
        self.id_var = tk.StringVar(value="-")

        self._build_ui()
        self._bind_keys()

        if quiz_path:
            self.open_quiz(quiz_path)

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.rowconfigure(2, weight=1)

        top = ttk.Frame(self, padding=10)
        top.grid(row=0, column=0, sticky="ew")
        top.columnconfigure(3, weight=1)

        ttk.Button(top, text="JSON öffnen", command=self.choose_quiz_file).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(top, text="Speichern", command=self.save_state).grid(row=0, column=1, padx=(0, 8))

        ttk.Label(top, text="Filter:").grid(row=0, column=2, padx=(12, 6))
        self.filter_combo = ttk.Combobox(
            top,
            textvariable=self.filter_var,
            values=FILTER_VALUES,
            state="readonly",
            width=18,
        )
        self.filter_combo.grid(row=0, column=3, sticky="w")
        self.filter_combo.bind("<<ComboboxSelected>>", lambda e: self.apply_filter())

        meta = ttk.Frame(self, padding=(10, 0, 10, 10))
        meta.grid(row=1, column=0, sticky="ew")
        meta.columnconfigure(0, weight=1)

        self.progress_label = ttk.Label(meta, textvariable=self.progress_var, font=("Arial", 11, "bold"))
        self.progress_label.grid(row=0, column=0, sticky="w")

        ttk.Label(meta, text="Kategorie:", font=("Arial", 10, "bold")).grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Label(meta, textvariable=self.category_var, wraplength=900).grid(row=2, column=0, sticky="w")

        ttk.Label(meta, text="Frage-ID:", font=("Arial", 10, "bold")).grid(row=3, column=0, sticky="w", pady=(8, 0))
        ttk.Label(meta, textvariable=self.id_var, wraplength=900).grid(row=4, column=0, sticky="w")

        content = ttk.Frame(self, padding=(10, 0, 10, 10))
        content.grid(row=2, column=0, sticky="nsew")
        content.columnconfigure(0, weight=1)
        content.rowconfigure(1, weight=1)
        content.rowconfigure(3, weight=1)
        content.rowconfigure(5, weight=1)

        ttk.Label(content, text="Frage", font=("Arial", 12, "bold")).grid(row=0, column=0, sticky="w")
        self.question_text = tk.Text(content, wrap="word", height=7, font=("Arial", 13))
        self.question_text.grid(row=1, column=0, sticky="nsew", pady=(4, 10))
        self.question_text.config(state="disabled")

        ttk.Label(content, text="Antwort", font=("Arial", 12, "bold")).grid(row=2, column=0, sticky="w")
        self.answer_text = tk.Text(content, wrap="word", height=6, font=("Arial", 12))
        self.answer_text.grid(row=3, column=0, sticky="nsew", pady=(4, 10))
        self.answer_text.config(state="disabled")

        ttk.Label(content, text="Optionen (falls vorhanden)", font=("Arial", 12, "bold")).grid(row=4, column=0, sticky="w")
        self.options_text = tk.Text(content, wrap="word", height=6, font=("Arial", 11))
        self.options_text.grid(row=5, column=0, sticky="nsew", pady=(4, 10))
        self.options_text.config(state="disabled")

        note_frame = ttk.Frame(self, padding=(10, 0, 10, 10))
        note_frame.grid(row=3, column=0, sticky="ew")
        note_frame.columnconfigure(0, weight=1)

        ttk.Label(note_frame, text="Notiz", font=("Arial", 11, "bold")).grid(row=0, column=0, sticky="w")
        self.note_text = tk.Text(note_frame, wrap="word", height=4, font=("Arial", 11))
        self.note_text.grid(row=1, column=0, sticky="ew", pady=(4, 0))
        self.note_text.bind("<KeyRelease>", lambda e: self.on_note_changed())

        bottom = ttk.Frame(self, padding=10)
        bottom.grid(row=4, column=0, sticky="ew")
        bottom.columnconfigure(1, weight=1)

        nav_frame = ttk.Frame(bottom)
        nav_frame.grid(row=0, column=0, sticky="w")

        ttk.Button(nav_frame, text="← Vorherige", command=self.prev_question).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(nav_frame, text="Nächste →", command=self.next_question).grid(row=0, column=1, padx=(0, 8))

        status_frame = ttk.Frame(bottom)
        status_frame.grid(row=0, column=1)

        ttk.Button(status_frame, text="1 Behalten", command=lambda: self.set_status(STATUS_KEEP)).grid(row=0, column=0, padx=4)
        ttk.Button(status_frame, text="2 Überarbeiten", command=lambda: self.set_status(STATUS_REWORK)).grid(row=0, column=1, padx=4)
        ttk.Button(status_frame, text="3 Entfernen", command=lambda: self.set_status(STATUS_REMOVE)).grid(row=0, column=2, padx=4)

        current_status_frame = ttk.Frame(bottom)
        current_status_frame.grid(row=0, column=2, sticky="e")

        ttk.Label(current_status_frame, text="Status:", font=("Arial", 10, "bold")).grid(row=0, column=0, padx=(8, 6))
        self.status_badge = ttk.Label(current_status_frame, textvariable=self.status_var)
        self.status_badge.grid(row=0, column=1)

    def _bind_keys(self) -> None:
        self.bind("<Left>", lambda e: self.prev_question())
        self.bind("<Right>", lambda e: self.next_question())
        self.bind("<Key-a>", lambda e: self.prev_question())
        self.bind("<Key-A>", lambda e: self.prev_question())
        self.bind("<Key-d>", lambda e: self.next_question())
        self.bind("<Key-D>", lambda e: self.next_question())

        self.bind("<Key-1>", lambda e: self.set_status(STATUS_KEEP))
        self.bind("<Key-2>", lambda e: self.set_status(STATUS_REWORK))
        self.bind("<Key-3>", lambda e: self.set_status(STATUS_REMOVE))

        self.bind("<Control-s>", lambda e: self.save_state())
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    def choose_quiz_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Quiz-JSON auswählen",
            filetypes=[("JSON Dateien", "*.json"), ("Alle Dateien", "*.*")]
        )
        if not path:
            return
        self.open_quiz(path)

    def open_quiz(self, path: str) -> None:
        try:
            questions = QuizLoader.load_questions(path)
        except Exception as exc:
            messagebox.showerror("Fehler", f"Quiz-Datei konnte nicht geladen werden:\n\n{exc}")
            return

        self.quiz_path = path
        self.review_path = os.path.join(os.path.dirname(path), DEFAULT_REVIEW_FILE)
        self.review_state = ReviewState(self.review_path)

        self.questions = questions
        self.current_filtered_pos = 0
        self.apply_filter(show_message=False)

    def apply_filter(self, show_message: bool = False) -> None:
        if not self.questions or not self.review_state:
            return

        selected = self.filter_var.get()
        self.save_current_note_if_possible()

        self.filtered_indices = []
        for idx, question in enumerate(self.questions):
            status = self.review_state.get_status(question.question_id)
            if selected == "alle" or status == selected:
                self.filtered_indices.append(idx)

        self.current_filtered_pos = 0

        if not self.filtered_indices:
            self.clear_display()
            self.progress_var.set("Keine Fragen für diesen Filter")
            self.category_var.set("-")
            self.id_var.set("-")
            self.status_var.set("-")
            if show_message:
                messagebox.showinfo("Hinweis", "Keine Fragen für den gewählten Filter gefunden.")
            return

        self.show_current_question()

    def get_current_question(self) -> Optional[QuestionItem]:
        if not self.filtered_indices:
            return None
        if self.current_filtered_pos < 0 or self.current_filtered_pos >= len(self.filtered_indices):
            return None
        idx = self.filtered_indices[self.current_filtered_pos]
        return self.questions[idx]

    def clear_display(self) -> None:
        self._set_text(self.question_text, "")
        self._set_text(self.answer_text, "")
        self._set_text(self.options_text, "")
        self.note_text.delete("1.0", "end")

    def show_current_question(self) -> None:
        question = self.get_current_question()
        if not question or not self.review_state:
            self.clear_display()
            return

        status = self.review_state.get_status(question.question_id)
        note = self.review_state.get_note(question.question_id)

        total_filtered = len(self.filtered_indices)
        absolute_index = self.filtered_indices[self.current_filtered_pos] + 1
        total_all = len(self.questions)

        self.progress_var.set(
            f"Gefiltert: {self.current_filtered_pos + 1} von {total_filtered} | Gesamt: {absolute_index} von {total_all}"
        )
        self.category_var.set(question.category_name)
        self.id_var.set(question.question_id)
        self.status_var.set(status)

        self._set_text(self.question_text, question.question)
        self._set_text(self.answer_text, question.answer or "(keine Antwort gefunden)")

        if question.options:
            options_text = "\n".join(f"{i+1}. {opt}" for i, opt in enumerate(question.options))
        else:
            options_text = "(keine Antwortoptionen vorhanden)"
        self._set_text(self.options_text, options_text)

        self.note_text.delete("1.0", "end")
        self.note_text.insert("1.0", note)

    @staticmethod
    def _set_text(widget: tk.Text, value: str) -> None:
        widget.config(state="normal")
        widget.delete("1.0", "end")
        widget.insert("1.0", value)
        widget.config(state="disabled")

    def prev_question(self) -> None:
        if not self.filtered_indices:
            return
        self.save_current_note_if_possible()
        if self.current_filtered_pos > 0:
            self.current_filtered_pos -= 1
            self.show_current_question()

    def next_question(self) -> None:
        if not self.filtered_indices:
            return
        self.save_current_note_if_possible()
        if self.current_filtered_pos < len(self.filtered_indices) - 1:
            self.current_filtered_pos += 1
            self.show_current_question()

    def set_status(self, status: str) -> None:
        question = self.get_current_question()
        if not question or not self.review_state:
            return

        self.review_state.set_status(question.question_id, status)
        self.status_var.set(status)
        self.save_current_note_if_possible()
        self.review_state.save()

        current_filter = self.filter_var.get()
        if current_filter != "alle" and current_filter != status:
            current_qid = question.question_id
            self.apply_filter(show_message=False)

            if not self.filtered_indices:
                return

            for pos, idx in enumerate(self.filtered_indices):
                if self.questions[idx].question_id == current_qid:
                    self.current_filtered_pos = pos
                    break
            else:
                if self.current_filtered_pos >= len(self.filtered_indices):
                    self.current_filtered_pos = max(0, len(self.filtered_indices) - 1)

            self.show_current_question()
        else:
            self.show_current_question()

    def on_note_changed(self) -> None:
        self.save_current_note_if_possible(auto_save=False)

    def save_current_note_if_possible(self, auto_save: bool = False) -> None:
        question = self.get_current_question()
        if not question or not self.review_state:
            return

        note = self.note_text.get("1.0", "end").strip()
        self.review_state.set_note(question.question_id, note)

        if auto_save:
            self.review_state.save()

    def save_state(self) -> None:
        if not self.review_state:
            return
        self.save_current_note_if_possible()
        self.review_state.save()
        messagebox.showinfo("Gespeichert", f"Review-Daten gespeichert:\n{self.review_state.path}")

    def on_close(self) -> None:
        try:
            if self.review_state:
                self.save_current_note_if_possible()
                self.review_state.save()
        except Exception:
            pass
        self.destroy()


def main() -> None:
    quiz_path = sys.argv[1] if len(sys.argv) > 1 else None
    app = QuizReviewApp(quiz_path=quiz_path)
    app.mainloop()


if __name__ == "__main__":
    main()
