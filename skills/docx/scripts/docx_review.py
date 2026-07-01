#!/usr/bin/env python3
"""Small DOCX helpers for AgentCraft project review workflows.

The script intentionally uses only Python's standard library. It can extract
paragraph text from a .docx and append Word comments to paragraphs.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile
import xml.etree.ElementTree as ET

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "o": "urn:schemas-microsoft-com:office:office",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "v": "urn:schemas-microsoft-com:vml",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "wp14": "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing",
    "w10": "urn:schemas-microsoft-com:office:word",
    "w14": "http://schemas.microsoft.com/office/word/2010/wordml",
    "w15": "http://schemas.microsoft.com/office/word/2012/wordml",
    "wne": "http://schemas.microsoft.com/office/word/2006/wordml",
    "wpc": "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas",
    "wpg": "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup",
    "wpi": "http://schemas.microsoft.com/office/word/2010/wordprocessingInk",
    "wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
    "wpsCustomData": "http://www.wps.cn/officeDocument/2013/wpsCustomData",
}

COMMENTS_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
COMMENTS_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"

for prefix, uri in NS.items():
    ET.register_namespace("" if prefix in {"rel", "ct"} else prefix, uri)


def qn(prefix_name: str) -> str:
    prefix, name = prefix_name.split(":", 1)
    return f"{{{NS[prefix]}}}{name}"


def namespace_uri(name: str) -> str | None:
    if name.startswith("{") and "}" in name:
        return name[1:name.index("}")]
    return None


def used_namespace_uris(root: ET.Element) -> set[str]:
    used: set[str] = set()
    for node in root.iter():
        uri = namespace_uri(node.tag)
        if uri:
            used.add(uri)
        for attr in node.attrib:
            uri = namespace_uri(attr)
            if uri:
                used.add(uri)
    return used


def prune_ignorable_namespaces(root: ET.Element) -> None:
    ignorable_attr = qn("mc:Ignorable")
    value = root.attrib.get(ignorable_attr)
    if not value:
        return
    used = used_namespace_uris(root)
    keep: list[str] = []
    for prefix in value.split():
        uri = NS.get(prefix)
        if not uri or uri in used:
            keep.append(prefix)
    if keep:
        root.set(ignorable_attr, " ".join(keep))
    else:
        del root.attrib[ignorable_attr]


def read_xml(zf: ZipFile, path: str) -> ET.Element:
    return ET.fromstring(zf.read(path))


def paragraph_text(paragraph: ET.Element) -> str:
    pieces: list[str] = []
    for node in paragraph.iter():
        if node.tag == qn("w:t") and node.text:
            pieces.append(node.text)
        elif node.tag == qn("w:tab"):
            pieces.append("\t")
        elif node.tag == qn("w:br"):
            pieces.append("\n")
    return "".join(pieces)


def document_paragraphs(document_root: ET.Element) -> list[ET.Element]:
    body = document_root.find(qn("w:body"))
    if body is None:
        return []
    return [node for node in body.iter(qn("w:p"))]


def compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def sanitize_comment_text(value: Any) -> str:
    text = str(value or "").replace("\x00", "")
    return re.sub(r"[\x01-\x08\x0B\x0C\x0E-\x1F]", "", text).strip()


def initials_for(author: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", author or "")
    if not words:
        return "AC"
    return "".join(word[0].upper() for word in words[:3])[:4]


def cmd_extract(args: argparse.Namespace) -> int:
    with ZipFile(args.docx) as zf:
        document = read_xml(zf, "word/document.xml")
    paragraphs = []
    for index, paragraph in enumerate(document_paragraphs(document)):
        text = compact_text(paragraph_text(paragraph))
        if args.include_empty or text:
            paragraphs.append({"index": index, "text": text})
    payload = {"paragraphs": paragraphs}
    output = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0


def normalize_comments(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, dict):
        items = raw.get("comments") or raw.get("findings") or []
    else:
        items = []

    comments: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        text = sanitize_comment_text(item.get("comment") or item.get("text") or item.get("note"))
        if not text:
            continue
        paragraph_index = item.get("paragraphIndex", item.get("paragraph_index"))
        try:
            paragraph_index = int(paragraph_index) if paragraph_index is not None else None
        except (TypeError, ValueError):
            paragraph_index = None
        author = sanitize_comment_text(item.get("author") or item.get("stage") or "AgentCraft")
        severity = sanitize_comment_text(item.get("severity"))
        category = sanitize_comment_text(item.get("category"))
        stage = sanitize_comment_text(item.get("stage"))
        prefix = " | ".join(part for part in [stage, severity, category] if part)
        comments.append({
            "paragraphIndex": paragraph_index,
            "anchor": compact_text(str(item.get("anchor") or "")),
            "author": author or "AgentCraft",
            "initials": sanitize_comment_text(item.get("initials")) or initials_for(author),
            "comment": f"{prefix}: {text}" if prefix else text,
        })
    return comments


def next_relationship_id(rels_root: ET.Element) -> str:
    highest = 0
    for rel in rels_root.findall(f"{{{NS['rel']}}}Relationship"):
        rid = rel.get("Id", "")
        match = re.fullmatch(r"rId(\d+)", rid)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"rId{highest + 1}"


def ensure_comments_support(files: dict[str, bytes]) -> tuple[ET.Element, ET.Element, ET.Element]:
    document = ET.fromstring(files["word/document.xml"])

    comments_path = "word/comments.xml"
    if comments_path in files:
        comments_root = ET.fromstring(files[comments_path])
    else:
        comments_root = ET.Element(qn("w:comments"))

    rels_path = "word/_rels/document.xml.rels"
    if rels_path in files:
        rels_root = ET.fromstring(files[rels_path])
    else:
        rels_root = ET.Element(f"{{{NS['rel']}}}Relationships")
    has_comments_rel = any(
        rel.get("Type") == COMMENTS_REL_TYPE and rel.get("Target") == "comments.xml"
        for rel in rels_root.findall(f"{{{NS['rel']}}}Relationship")
    )
    if not has_comments_rel:
        ET.SubElement(
            rels_root,
            f"{{{NS['rel']}}}Relationship",
            {"Id": next_relationship_id(rels_root), "Type": COMMENTS_REL_TYPE, "Target": "comments.xml"},
        )

    content_types = ET.fromstring(files["[Content_Types].xml"])
    has_comments_override = any(
        node.get("PartName") == "/word/comments.xml"
        for node in content_types.findall(f"{{{NS['ct']}}}Override")
    )
    if not has_comments_override:
        ET.SubElement(
            content_types,
            f"{{{NS['ct']}}}Override",
            {"PartName": "/word/comments.xml", "ContentType": COMMENTS_CONTENT_TYPE},
        )
    return document, comments_root, rels_root, content_types


def max_comment_id(comments_root: ET.Element) -> int:
    max_id = -1
    for comment in comments_root.findall(qn("w:comment")):
        try:
            max_id = max(max_id, int(comment.get(qn("w:id"), "-1")))
        except ValueError:
            continue
    return max_id


def find_target_paragraph(paragraphs: list[ET.Element], comment: dict[str, Any]) -> ET.Element | None:
    index = comment.get("paragraphIndex")
    anchor = compact_text(comment.get("anchor") or "")
    anchor_lower = anchor.lower()
    if isinstance(index, int) and 0 <= index < len(paragraphs):
        indexed_paragraph = paragraphs[index]
        indexed_text = compact_text(paragraph_text(indexed_paragraph)).lower()
        if not anchor or anchor_lower in indexed_text:
            return indexed_paragraph
        for paragraph in paragraphs:
            if anchor_lower in compact_text(paragraph_text(paragraph)).lower():
                return paragraph
        return indexed_paragraph
    if anchor:
        for paragraph in paragraphs:
            if anchor_lower in compact_text(paragraph_text(paragraph)).lower():
                return paragraph
    return next((paragraph for paragraph in paragraphs if compact_text(paragraph_text(paragraph))), paragraphs[0] if paragraphs else None)


def add_comment_text(comments_root: ET.Element, comment_id: int, comment: dict[str, Any]) -> None:
    element = ET.SubElement(
        comments_root,
        qn("w:comment"),
        {
            qn("w:id"): str(comment_id),
            qn("w:author"): comment["author"],
            qn("w:initials"): comment["initials"],
            qn("w:date"): datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        },
    )
    paragraph = ET.SubElement(element, qn("w:p"))
    run = ET.SubElement(paragraph, qn("w:r"))
    text = ET.SubElement(run, qn("w:t"))
    text.text = comment["comment"]


def add_comment_marker(paragraph: ET.Element, comment_id: int) -> None:
    start = ET.Element(qn("w:commentRangeStart"), {qn("w:id"): str(comment_id)})
    end = ET.Element(qn("w:commentRangeEnd"), {qn("w:id"): str(comment_id)})
    ref_run = ET.Element(qn("w:r"))
    ET.SubElement(ref_run, qn("w:commentReference"), {qn("w:id"): str(comment_id)})

    insert_at = 1 if len(paragraph) and paragraph[0].tag == qn("w:pPr") else 0
    paragraph.insert(insert_at, start)
    paragraph.append(end)
    paragraph.append(ref_run)


def serialize_xml(root: ET.Element) -> bytes:
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def serialize_xml_with_default_namespace(root: ET.Element, uri: str) -> bytes:
    ET.register_namespace("", uri)
    return serialize_xml(root)


def cmd_apply_comments(args: argparse.Namespace) -> int:
    raw = json.loads(Path(args.comments_json).read_text(encoding="utf-8"))
    comments = normalize_comments(raw)
    if not comments:
        raise SystemExit("no valid comments found")

    with ZipFile(args.input_docx) as zf:
        files = {name: zf.read(name) for name in zf.namelist()}

    document, comments_root, rels_root, content_types = ensure_comments_support(files)
    paragraphs = document_paragraphs(document)
    next_id = max_comment_id(comments_root) + 1
    unresolved = 0
    for offset, comment in enumerate(comments):
        comment_id = next_id + offset
        target = find_target_paragraph(paragraphs, comment)
        if target is None:
            unresolved += 1
            continue
        if comment.get("paragraphIndex") is None and comment.get("anchor"):
            target_text = compact_text(paragraph_text(target)).lower()
            if comment["anchor"].lower() not in target_text:
                comment = deepcopy(comment)
                comment["comment"] = f"Unresolved anchor '{comment['anchor']}'. {comment['comment']}"
        add_comment_text(comments_root, comment_id, comment)
        add_comment_marker(target, comment_id)

    prune_ignorable_namespaces(document)
    files["word/document.xml"] = serialize_xml(document)
    files["word/comments.xml"] = serialize_xml(comments_root)
    files["word/_rels/document.xml.rels"] = serialize_xml_with_default_namespace(rels_root, NS["rel"])
    files["[Content_Types].xml"] = serialize_xml_with_default_namespace(content_types, NS["ct"])

    output = Path(args.output_docx)
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", ZIP_DEFLATED) as out:
        for name, content in files.items():
            out.writestr(name, content)

    print(json.dumps({"commentsApplied": len(comments) - unresolved, "unresolved": unresolved}, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract DOCX paragraphs or append Word comments.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract = subparsers.add_parser("extract", help="Extract paragraph text from a DOCX file.")
    extract.add_argument("docx")
    extract.add_argument("--out")
    extract.add_argument("--include-empty", action="store_true")
    extract.set_defaults(func=cmd_extract)

    apply = subparsers.add_parser("apply-comments", help="Apply comments JSON to a DOCX file.")
    apply.add_argument("input_docx")
    apply.add_argument("comments_json")
    apply.add_argument("output_docx")
    apply.set_defaults(func=cmd_apply_comments)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
