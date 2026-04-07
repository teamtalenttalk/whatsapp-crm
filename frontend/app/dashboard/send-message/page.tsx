"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getDevices, getTemplates, getContacts, sendBulkMessage, uploadFile } from "@/lib/api";

interface PhoneRow {
  id: string;
  name: string;
  number: string;
  var1: string;
  var2: string;
}

interface Device {
  id: string;
  name: string;
  status: string;
}

interface Template {
  id: string;
  name: string;
  message: string;
  messageType?: string;
}

interface CTA {
  id: string;
  text: string;
  type: "url" | "call";
  value: string;
}

interface ListRow {
  id: string;
  title: string;
  description: string;
}

interface ListSection {
  id: string;
  title: string;
  rows: ListRow[];
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const MSG_TYPES = [
  { key: "text", label: "Text" },
  { key: "buttons", label: "Buttons" },
  { key: "list", label: "List" },
  { key: "media", label: "Media" },
] as const;

type MsgType = (typeof MSG_TYPES)[number]["key"];

export default function SendMessagePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [messageType, setMessageType] = useState<MsgType>("text");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<PhoneRow[]>([]);
  const [excludeUnsubs, setExcludeUnsubs] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  // Buttons state
  const [ctaButtons, setCtaButtons] = useState<CTA[]>([
    { id: uid(), text: "", type: "url", value: "" },
  ]);

  // List state
  const [listTitle, setListTitle] = useState("");
  const [listButtonText, setListButtonText] = useState("");
  const [listSections, setListSections] = useState<ListSection[]>([
    {
      id: uid(),
      title: "",
      rows: [{ id: uid(), title: "", description: "" }],
    },
  ]);

  // Media state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [mediaPreview, setMediaPreview] = useState("");
  const [mediaFileName, setMediaFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Scheduling state
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [campaignName, setCampaignName] = useState("");

  // CSV import
  const csvInputRef = useRef<HTMLInputElement>(null);

  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getDevices()
      .then((d) => {
        if (Array.isArray(d)) setDevices(d);
      })
      .catch(() => {});
    getTemplates()
      .then((t) => {
        if (Array.isArray(t)) setTemplates(t);
      })
      .catch(() => {});
  }, []);

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      setSelectedTemplate(templateId);
      const t = templates.find((t) => t.id === templateId);
      if (t) {
        setMessage(t.message);
        if (t.messageType && MSG_TYPES.some((mt) => mt.key === t.messageType)) {
          setMessageType(t.messageType as MsgType);
        }
      }
    },
    [templates]
  );

  // --- Variable insertion ---
  function insertVariable(variable: string) {
    const ta = messageRef.current;
    if (!ta) {
      setMessage((prev) => prev + variable);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newMsg = message.slice(0, start) + variable + message.slice(end);
    setMessage(newMsg);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + variable.length;
    }, 0);
  }

  // --- CTA Buttons ---
  function addCtaButton() {
    if (ctaButtons.length >= 5) return;
    setCtaButtons([...ctaButtons, { id: uid(), text: "", type: "url", value: "" }]);
  }
  function removeCtaButton(id: string) {
    if (ctaButtons.length <= 1) return;
    setCtaButtons(ctaButtons.filter((b) => b.id !== id));
  }
  function updateCtaButton(id: string, field: keyof CTA, value: string) {
    setCtaButtons(
      ctaButtons.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    );
  }

  // --- List builder ---
  function addSection() {
    setListSections([
      ...listSections,
      { id: uid(), title: "", rows: [{ id: uid(), title: "", description: "" }] },
    ]);
  }
  function removeSection(sectionId: string) {
    if (listSections.length <= 1) return;
    setListSections(listSections.filter((s) => s.id !== sectionId));
  }
  function updateSectionTitle(sectionId: string, title: string) {
    setListSections(
      listSections.map((s) => (s.id === sectionId ? { ...s, title } : s))
    );
  }
  function addRow(sectionId: string) {
    setListSections(
      listSections.map((s) =>
        s.id === sectionId
          ? { ...s, rows: [...s.rows, { id: uid(), title: "", description: "" }] }
          : s
      )
    );
  }
  function removeRow(sectionId: string, rowId: string) {
    setListSections(
      listSections.map((s) =>
        s.id === sectionId
          ? { ...s, rows: s.rows.length > 1 ? s.rows.filter((r) => r.id !== rowId) : s.rows }
          : s
      )
    );
  }
  function updateListRow(sectionId: string, rowId: string, field: "title" | "description", value: string) {
    setListSections(
      listSections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              rows: s.rows.map((r) =>
                r.id === rowId ? { ...r, [field]: value } : r
              ),
            }
          : s
      )
    );
  }

  // --- Media upload ---
  async function handleFileSelect(file: File) {
    setMediaFile(file);
    setMediaFileName(file.name);

    // Preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setMediaPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setMediaPreview("");
    }

    // Upload
    setUploading(true);
    try {
      const result = await uploadFile(file);
      setMediaUrl(result.url || result.path || "");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  // --- Phone rows ---
  function addRow2() {
    setRows([...rows, { id: uid(), name: "", number: "", var1: "", var2: "" }]);
  }

  function updateRow(id: string, field: keyof PhoneRow, value: string) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function deleteRow(id: string) {
    setRows(rows.filter((r) => r.id !== id));
  }

  function handleImport() {
    const lines = importText
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const newRows: PhoneRow[] = lines.map((line) => {
      const parts = line.split(/[\t|]+/);
      return {
        id: uid(),
        name: parts[1] || "",
        number: parts[0],
        var1: parts[2] || "",
        var2: parts[3] || "",
      };
    });
    setRows([...rows, ...newRows]);
    setShowImport(false);
    setImportText("");
  }

  async function handleImportContacts() {
    try {
      const contacts = await getContacts();
      const list = Array.isArray(contacts) ? contacts : contacts?.data || [];
      const newRows: PhoneRow[] = list
        .filter((c: { phone?: string }) => c.phone)
        .map((c: { phone: string; name?: string }) => ({
          id: uid(),
          name: c.name || "",
          number: c.phone,
          var1: "",
          var2: "",
        }));
      setRows([...rows, ...newRows]);
    } catch {
      setStatus("Failed to load contacts");
    }
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      // Skip header if first line contains non-numeric chars
      const start = lines[0] && !/^\+?\d/.test(lines[0].split(/[,;\t|]/)[0]) ? 1 : 0;
      const newRows: PhoneRow[] = [];
      for (let i = start; i < lines.length; i++) {
        const parts = lines[i].split(/[,;\t|]+/);
        if (parts[0]) {
          newRows.push({
            id: uid(),
            name: parts[1] || "",
            number: parts[0].trim(),
            var1: parts[2] || "",
            var2: parts[3] || "",
          });
        }
      }
      setRows((prev) => [...prev, ...newRows]);
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = "";
  }

  function clearInvalid() {
    setRows(rows.filter((r) => /^\+?\d{7,15}$/.test(r.number.replace(/\s/g, ""))));
  }

  function removeDuplicates() {
    const seen = new Set<string>();
    setRows(
      rows.filter((r) => {
        const n = r.number.replace(/\s/g, "");
        if (seen.has(n)) return false;
        seen.add(n);
        return true;
      })
    );
  }

  function insertCountryCode() {
    const code = prompt("Enter country code (e.g. +1, +91):");
    if (!code) return;
    setRows(
      rows.map((r) => ({
        ...r,
        number: r.number.startsWith("+")
          ? r.number
          : code + r.number.replace(/^0+/, ""),
      }))
    );
  }

  // --- Send ---
  async function handleSend() {
    if (!selectedDevice) {
      setStatus("Please select a device.");
      return;
    }
    if (rows.length === 0) {
      setStatus("Please add at least one recipient.");
      return;
    }
    if (messageType === "text" && !message.trim()) {
      setStatus("Please enter a message.");
      return;
    }
    if (messageType === "media" && !mediaUrl) {
      setStatus("Please upload a media file.");
      return;
    }

    setSending(true);
    setStatus("");

    const payload: Record<string, unknown> = {
      device_id: selectedDevice,
      template_id: selectedTemplate || undefined,
      message_type: messageType,
      message: message,
      recipients: rows.map((r) => ({
        phone: r.number,
        name: r.name,
        var1: r.var1,
        var2: r.var2,
      })),
      exclude_unsubscribes: excludeUnsubs,
    };

    if (campaignName) payload.campaign_name = campaignName;

    if (scheduleMode === "later" && scheduleDate && scheduleTime) {
      payload.scheduled_at = `${scheduleDate}T${scheduleTime}`;
    }

    if (messageType === "buttons") {
      payload.buttons = ctaButtons.map((b) => ({
        text: b.text,
        type: b.type,
        value: b.value,
      }));
    }

    if (messageType === "list") {
      payload.list = {
        title: listTitle,
        buttonText: listButtonText,
        sections: listSections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({ title: r.title, description: r.description })),
        })),
      };
    }

    if (messageType === "media") {
      payload.media = {
        url: mediaUrl,
        caption: mediaCaption,
        filename: mediaFileName,
      };
    }

    try {
      await sendBulkMessage(payload);
      setStatus(
        scheduleMode === "later"
          ? "Campaign scheduled successfully!"
          : "Messages queued successfully!"
      );
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Send Message</h1>

      {status && (
        <div
          className={`rounded-lg px-4 py-3 text-sm mb-4 ${
            status.includes("success")
              ? "bg-green-500/10 border border-green-500/30 text-green-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {status}
          <button
            onClick={() => setStatus("")}
            className="ml-2 hover:text-white"
          >
            &times;
          </button>
        </div>
      )}

      {/* Config row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Template
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="input-dark"
          >
            <option value="">-- Select Template --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Device
          </label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="input-dark"
          >
            <option value="">-- Select Device --</option>
            {devices
              .filter((d) => d.status === "connected")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Campaign Name
          </label>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="input-dark"
            placeholder="Optional campaign name"
          />
        </div>
      </div>

      {/* Message Type Tabs */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Message Type
        </label>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
          {MSG_TYPES.map((mt) => (
            <button
              key={mt.key}
              onClick={() => setMessageType(mt.key)}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                messageType === mt.key
                  ? "bg-[#25D366] text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              {mt.label}
            </button>
          ))}
        </div>
      </div>

      {/* =================== TEXT =================== */}
      {messageType === "text" && (
        <div className="card mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Message
          </label>
          <textarea
            ref={messageRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="input-dark font-mono text-sm"
            placeholder={"Hello {{name}}, {{var1}} {{var2}}"}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs text-slate-500">Insert variable:</span>
            {["{{name}}", "{{phone}}", "{{var1}}", "{{var2}}"].map((v) => (
              <button
                key={v}
                onClick={() => insertVariable(v)}
                className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* =================== BUTTONS =================== */}
      {messageType === "buttons" && (
        <div className="card mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Message Body
            </label>
            <textarea
              ref={messageRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="input-dark font-mono text-sm"
              placeholder="Message text shown above the buttons"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs text-slate-500">Insert variable:</span>
              {["{{name}}", "{{phone}}", "{{var1}}", "{{var2}}"].map((v) => (
                <button
                  key={v}
                  onClick={() => insertVariable(v)}
                  className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-300">
                CTA Buttons ({ctaButtons.length}/5)
              </label>
              <button
                onClick={addCtaButton}
                disabled={ctaButtons.length >= 5}
                className="px-3 py-1 text-xs rounded-lg bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors disabled:opacity-50"
              >
                + Add Button
              </button>
            </div>
            <div className="space-y-3">
              {ctaButtons.map((btn, i) => (
                <div
                  key={btn.id}
                  className="flex flex-col sm:flex-row gap-2 p-3 rounded-lg bg-slate-900/50 border border-slate-700"
                >
                  <div className="flex items-center text-xs text-slate-500 w-6 shrink-0">
                    {i + 1}
                  </div>
                  <input
                    type="text"
                    value={btn.text}
                    onChange={(e) =>
                      updateCtaButton(btn.id, "text", e.target.value)
                    }
                    className="input-dark text-sm flex-1"
                    placeholder="Button text"
                  />
                  <select
                    value={btn.type}
                    onChange={(e) =>
                      updateCtaButton(
                        btn.id,
                        "type",
                        e.target.value as "url" | "call"
                      )
                    }
                    className="input-dark text-sm w-full sm:w-28"
                  >
                    <option value="url">URL</option>
                    <option value="call">Call</option>
                  </select>
                  <input
                    type="text"
                    value={btn.value}
                    onChange={(e) =>
                      updateCtaButton(btn.id, "value", e.target.value)
                    }
                    className="input-dark text-sm flex-1"
                    placeholder={
                      btn.type === "url"
                        ? "https://example.com"
                        : "+1234567890"
                    }
                  />
                  <button
                    onClick={() => removeCtaButton(btn.id)}
                    className="text-red-400 hover:text-red-300 text-xs px-2 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================== LIST =================== */}
      {messageType === "list" && (
        <div className="card mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                List Title
              </label>
              <input
                type="text"
                value={listTitle}
                onChange={(e) => setListTitle(e.target.value)}
                className="input-dark text-sm"
                placeholder="Menu title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Button Text
              </label>
              <input
                type="text"
                value={listButtonText}
                onChange={(e) => setListButtonText(e.target.value)}
                className="input-dark text-sm"
                placeholder="View Options"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Message Body
            </label>
            <textarea
              ref={messageRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="input-dark font-mono text-sm"
              placeholder="Message text shown above the list button"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-300">
                Sections ({listSections.length})
              </label>
              <button
                onClick={addSection}
                className="px-3 py-1 text-xs rounded-lg bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors"
              >
                + Add Section
              </button>
            </div>
            <div className="space-y-4">
              {listSections.map((section, si) => (
                <div
                  key={section.id}
                  className="p-4 rounded-lg bg-slate-900/50 border border-slate-700"
                >
                  <div className="flex items-center justify-between mb-3">
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) =>
                        updateSectionTitle(section.id, e.target.value)
                      }
                      className="input-dark text-sm flex-1 mr-2"
                      placeholder={`Section ${si + 1} title`}
                    />
                    <button
                      onClick={() => removeSection(section.id)}
                      className="text-red-400 hover:text-red-300 text-xs px-2 shrink-0"
                    >
                      Remove Section
                    </button>
                  </div>
                  <div className="space-y-2">
                    {section.rows.map((row, ri) => (
                      <div
                        key={row.id}
                        className="flex flex-col sm:flex-row gap-2"
                      >
                        <span className="text-xs text-slate-500 w-6 shrink-0 pt-2">
                          {ri + 1}
                        </span>
                        <input
                          type="text"
                          value={row.title}
                          onChange={(e) =>
                            updateListRow(
                              section.id,
                              row.id,
                              "title",
                              e.target.value
                            )
                          }
                          className="input-dark text-sm flex-1"
                          placeholder="Row title"
                        />
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) =>
                            updateListRow(
                              section.id,
                              row.id,
                              "description",
                              e.target.value
                            )
                          }
                          className="input-dark text-sm flex-1"
                          placeholder="Description (optional)"
                        />
                        <button
                          onClick={() => removeRow(section.id, row.id)}
                          className="text-red-400 hover:text-red-300 text-xs px-2 shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => addRow(section.id)}
                    className="mt-2 px-3 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
                  >
                    + Add Row
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =================== MEDIA =================== */}
      {messageType === "media" && (
        <div className="card mb-6 space-y-4">
          {/* Drop zone */}
          <div
            ref={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-600 hover:border-[#25D366] rounded-lg p-8 text-center cursor-pointer transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-slate-600 border-t-green-400 rounded-full animate-spin" />
                <span className="text-sm text-slate-400">Uploading...</span>
              </div>
            ) : mediaPreview ? (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={mediaPreview}
                  alt="Preview"
                  className="max-h-40 rounded-lg"
                />
                <span className="text-sm text-slate-300">{mediaFileName}</span>
                <span className="text-xs text-slate-500">
                  Click or drag to replace
                </span>
              </div>
            ) : mediaFileName ? (
              <div className="flex flex-col items-center gap-3">
                <svg
                  className="w-12 h-12 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <span className="text-sm text-slate-300">{mediaFileName}</span>
                <span className="text-xs text-slate-500">
                  Click or drag to replace
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <svg
                  className="w-10 h-10 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <span className="text-sm text-slate-400">
                  Drag &amp; drop or click to upload
                </span>
                <span className="text-xs text-slate-500">
                  Image, Video, or Document
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Caption
            </label>
            <textarea
              value={mediaCaption}
              onChange={(e) => setMediaCaption(e.target.value)}
              rows={3}
              className="input-dark font-mono text-sm"
              placeholder="Optional caption for the media"
            />
          </div>
        </div>
      )}

      {/* =================== RECIPIENTS =================== */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
          <h3 className="text-white font-semibold">
            Recipients ({rows.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={addRow2}
              className="px-3 py-1.5 text-xs rounded-lg bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors"
            >
              + Add
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              Import
            </button>
            <button
              onClick={handleImportContacts}
              className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
            >
              Import from Contacts
            </button>
            <button
              onClick={() => csvInputRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
            >
              Import from CSV
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleCsvImport}
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={excludeUnsubs}
              onChange={(e) => setExcludeUnsubs(e.target.checked)}
              className="rounded bg-slate-700 border-slate-600 text-[#25D366] focus:ring-[#25D366]"
            />
            Exclude Unsubscribed
          </label>
          <div className="flex-1" />
          <button
            onClick={clearInvalid}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
          >
            Clear Invalid
          </button>
          <button
            onClick={insertCountryCode}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
          >
            Insert Country Code
          </button>
          <button
            onClick={removeDuplicates}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
          >
            Remove Duplicates
          </button>
          <button
            onClick={() => setRows([])}
            className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            Clear All
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">
            No numbers added. Click Add, Import, or Import from Contacts to
            begin.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium w-12">
                    SN
                  </th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">
                    Name
                  </th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">
                    Number
                  </th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">
                    Variable 1
                  </th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">
                    Variable 2
                  </th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium w-20">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-700/50 hover:bg-slate-800/80"
                  >
                    <td className="py-2 px-3 text-slate-500">{i + 1}</td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) =>
                          updateRow(row.id, "name", e.target.value)
                        }
                        className="bg-transparent border-0 text-white text-sm w-full focus:outline-none"
                        placeholder="Name"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.number}
                        onChange={(e) =>
                          updateRow(row.id, "number", e.target.value)
                        }
                        className="bg-transparent border-0 text-white text-sm w-full focus:outline-none"
                        placeholder="+1234567890"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.var1}
                        onChange={(e) =>
                          updateRow(row.id, "var1", e.target.value)
                        }
                        className="bg-transparent border-0 text-white text-sm w-full focus:outline-none"
                        placeholder="Var 1"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={row.var2}
                        onChange={(e) =>
                          updateRow(row.id, "var2", e.target.value)
                        }
                        className="bg-transparent border-0 text-white text-sm w-full focus:outline-none"
                        placeholder="Var 2"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => deleteRow(row.id)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =================== SCHEDULING =================== */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 mb-4">
          <label className="text-sm font-medium text-slate-300">
            Scheduling
          </label>
          <div className="flex gap-1 bg-slate-900/50 rounded-lg p-1">
            <button
              onClick={() => setScheduleMode("now")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                scheduleMode === "now"
                  ? "bg-[#25D366] text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Send Now
            </button>
            <button
              onClick={() => setScheduleMode("later")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                scheduleMode === "later"
                  ? "bg-[#25D366] text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Schedule for Later
            </button>
          </div>
        </div>
        {scheduleMode === "later" && (
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="input-dark w-auto"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Time</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="input-dark w-auto"
              />
            </div>
          </div>
        )}
      </div>

      {/* =================== SEND =================== */}
      <button
        onClick={handleSend}
        disabled={sending}
        className="btn-wa w-full py-3 text-lg"
      >
        {sending
          ? "Sending..."
          : scheduleMode === "later"
          ? "Schedule Campaign"
          : "Send Now"}
      </button>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-lg">
            <h2 className="text-lg font-bold text-white mb-4">
              Import Numbers
            </h2>
            <p className="text-sm text-slate-400 mb-3">
              Paste numbers, one per line. Format: number | name | var1 | var2
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="input-dark font-mono text-sm mb-4"
              placeholder={"+1234567890\n+1234567891|John\n+1234567892|Jane|VIP|Gold"}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportText("");
                }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white border border-slate-600 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button onClick={handleImport} className="btn-wa">
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
