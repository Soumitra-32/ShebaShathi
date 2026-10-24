"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComplaintCategory,
  ComplaintDraft,
  MissingDetail,
  buildDraft,
  findMissingDetails,
  CATEGORIES,
} from "../../lib/local/complaint";
import {
  FileKind,
  ValidatedFile,
  formatBytes,
  releasePreviewUrl,
  validateFiles,
} from "../../lib/local/files";
import { extractDocumentText } from "../../lib/local/extract";
import {
  LocalSpeechRecorder,
  SpeechError,
  isSpeechModelInstalled,
  isSpeechSupported,
  transcribeLocally,
} from "../../lib/local/speech";
import { Mic, MicOff, StopCircle, AlertCircle, Loader2 } from "lucide-react";
import { useLanguage } from "../../lib/language";

type Lang = "bn" | "en";

const MAX_ATTACHMENTS = 2;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const copy = {
  bn: {
    title: "অভিযোগের খসড়া তৈরি করুন",
    intro: "তথ্যগুলো লিখুন বা কণ্ঠে বলুন। খসড়াটি আপনার ব্রাউজারেই তৈরি হয় এবং কোথাও পাঠানো হয় না।",
    privacy:
      "আপনার লেখা, ছবি, PDF ও কণ্ঠের অডিও—সবকিছু আপনার ব্রাউজারের ভেতরেই থাকে। কোনো সার্ভারে পাঠানো হয় না, সংরক্ষণ করা হয় না, এবং পাতা বন্ধ বা রিলোড করলে মুছে যায়।",
    date: "ঘটনার তারিখ",
    location: "স্থান / অফিস",
    category: "ঘটনার ধরন",
    reference: "রেফারেন্স নম্বর (ঐচ্ছিক)",
    description: "ঘটনার বিবরণ",
    required: "আবশ্যক",
    optional: "ঐচ্ছিক",
    mic: "কণ্ঠে বলুন",
    micStop: "বন্ধ করুন",
    micUnsupported:
      "এই ব্রাউজারে স্থানীয় ভয়েস রেকর্ডিং চালু করা যায়নি। নিচের ঘরে হাতে লিখতে পারেন—আপনার অডিও কোথাও পাঠানো হচ্ছে না।",
    micPermission: "মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি। ব্রাউজারের সেটিংসে অনুমতি দিন বা হাতে লিখুন।",
    micModelMissing:
      "এই সার্ভারে স্থানীয় ভয়েস মডেল ইনস্টল করা নেই। প্রজেক্টের ফোল্ডারে `npm run fetch-models` চালানোর পর আবার চেষ্টা করুন; ততক্ষণ হাতে লিখুন।",
    micNoSpeech: "কোনো কথা শোনা যায়নি। আবার চেষ্টা করুন বা হাতে লিখুন।",
    micFailed: "কণ্ঠের লেখা পাওয়া যায়নি। আবার চেষ্টা করুন বা হাতে লিখুন।",
    micLoading: "স্থানীয় মডেল প্রস্তুত হচ্ছে…",
    micRecording: "রেকর্ডিং চলছে—বলা শুরু করুন।",
    micTranscribing: "লেখা চিহ্নিত করা হচ্ছে…",
    micTranscript: "চেনা লেখা",
    micUse: "বিবরণে যোগ করুন",
    micDiscard: "বাতিল করুন",
    attachments: "সংযুক্ত নথি (ঐচ্ছিক, সর্বোচ্চ ২টি)",
    attachmentHint:
      "শুধু প্রয়োজনীয় নথি সংযুক্ত করুন—বাড়তি ব্যক্তিগত তথ্য এড়িয়ে চলুন। ফাইলগুলো আপলোড হয় না, শুধু আপনার ব্রাউজারেই পড়া হয়।",
    addFile: "ফাইল যোগ করুন",
    removeFile: "সরান",
    reading: "ফাইল পড়া হচ্ছে…",
    fileTooLarge: "ফাইলটি বেশি বড় (সর্বোচ্চ ১০ এমবি)।",
    fileUnsupported: "এই ধরনের ফাইল গ্রহণ করা হয় না (শুধু ছবি বা PDF)।",
    fileMalformed: "ফাইলটির প্রকৃত বিষয়বস্তু পড়া গেল না—ফাইলটি ক্ষতিগ্রস্ত হতে পারে।",
    fileEmpty: "ফাইলটি খালি।",
    fileLimit: "সর্বোচ্চ ২টি ফাইল সংযুক্ত করা যাবে।",
    fileDuplicate: "এই ফাইলটি ইতিমধ্যে সংযুক্ত করা হয়েছে।",
    extractedText: "ফাইল থেকে পড়া লেখা",
    extractedHint: "পড়া লেখা যাচাই করুন বা সরিয়ে দিন—ভুল থাকলে খসড়ায় ভুল চলে যাবে।",
    truncated: "প্রথম কয়েকটি পৃষ্ঠা পড়া হয়েছে—বাকি পৃষ্ঠাগুলো নিজে দেখে নিন।",
    includeText: "খসড়ায় যোগ করুন",
    questionsTitle: "আরও কিছু তথ্য দরকার",
    questionsHint: "শুধু খসড়াটি সঠিক ও বিশ্বাসযোগ্য করার জন্য প্রয়োজনীয় প্রশ্নগুলো দেওয়া হয়েছে।",
    generate: "খসড়া তৈরি করুন",
    generating: "খসড়া তৈরি হচ্ছে…",
    draftTitle: "অভিযোগের খসড়া",
    draftEmpty: "তৈরি করা খসড়া এখানে দেখা যাবে।",
    draftHint: "খসড়াটি সম্পাদনা করা যাবে। জমা দেওয়ার আগে সব তথ্য যাচাই করুন।",
    copy: "কপি করুন",
    copied: "কপি হয়েছে",
    copyError: "ক্লিপবোর্ডে কপি করা যায়নি। লেখাটি নির্বাচন করে কপি করুন।",
    print: "PDF / প্রিন্ট",
    reset: "সব মুছে ফেলুন",
    portal: "GRS পোর্টাল",
    disclaimer:
      "ShebaShathi BD একটি স্বাধীন সহায়তা টুল, সরকারি ওয়েবসাইট নয়। অভিযোগ জমা দেওয়ার আগে তথ্য যাচাই করুন। এখানে কোনো অভিযোগ জমা দেওয়া হয় না।",
    placeholders: "ফাঁকা জায়গাগুলো পূরণ করতে হবে",
  },
  en: {
    title: "Create a complaint draft",
    intro: "Type the facts or speak them. The draft is created in your browser and is not sent anywhere.",
    privacy:
      "Your text, images, PDFs and voice audio stay inside your browser. Nothing is uploaded, nothing is stored, and everything is cleared when you close or reload the page.",
    date: "Incident date",
    location: "Place / office",
    category: "Type of incident",
    reference: "Reference number (optional)",
    description: "Description of the incident",
    required: "required",
    optional: "optional",
    mic: "Speak",
    micStop: "Stop",
    micUnsupported:
      "This browser cannot record audio locally. Type the details below instead—your audio is never uploaded.",
    micPermission: "Microphone permission was denied. Allow it in the browser settings or type the details.",
    micModelMissing:
      "The local voice model is not installed on this server. Run `npm run fetch-models` in the project folder and try again; type the details until then.",
    micNoSpeech: "No speech was recognised. Try again or type the details.",
    micFailed: "The speech could not be transcribed. Try again or type the details.",
    micLoading: "Preparing the local model…",
    micRecording: "Recording—start speaking.",
    micTranscribing: "Transcribing…",
    micTranscript: "Recognised text",
    micUse: "Add to the description",
    micDiscard: "Discard",
    attachments: "Supporting files (optional, up to 2)",
    attachmentHint:
      "Attach only what is needed and avoid unnecessary personal information. Files are never uploaded; they are read inside your browser.",
    addFile: "Add a file",
    removeFile: "Remove",
    reading: "Reading the file…",
    fileTooLarge: "The file is too large (10 MB maximum).",
    fileUnsupported: "This file type is not accepted (images and PDF only).",
    fileMalformed: "The real content of the file could not be read—it may be damaged.",
    fileEmpty: "The file is empty.",
    fileLimit: "At most 2 files can be attached.",
    fileDuplicate: "This file has already been attached.",
    extractedText: "Text read from the file",
    extractedHint: "Check the extracted text or remove it—errors would end up in the draft.",
    truncated: "Only the first pages were read—check the remaining pages yourself.",
    includeText: "Include in the draft",
    questionsTitle: "A few more details are needed",
    questionsHint: "Only the questions that make the draft accurate are asked.",
    generate: "Create the draft",
    generating: "Creating the draft…",
    draftTitle: "Complaint draft",
    draftEmpty: "The created draft will appear here.",
    draftHint: "You can edit the draft. Check every fact before submitting.",
    copy: "Copy",
    copied: "Copied",
    copyError: "The clipboard is not available. Select the text and copy it manually.",
    print: "PDF / print",
    reset: "Clear everything",
    portal: "GRS portal",
    disclaimer:
      "ShebaShathi BD is an independent help tool, not a government website. Check the facts before submitting a complaint. Nothing is submitted from here.",
    placeholders: "These placeholders still need a value",
  },
} satisfies Record<Lang, Record<string, string>>;

const CATEGORY_LABELS: Record<Lang, Record<ComplaintCategory, string>> = {
  bn: {
    delay: "সেবা পেতে বিলম্ব",
    bribe_demand: "অতিরিক্ত অর্থ দাবি",
    document_refusal: "নথি গ্রহণে অস্বীকৃতি",
    other: "অন্যান্য",
  },
  en: {
    delay: "Delay in service",
    bribe_demand: "Request for extra payment",
    document_refusal: "Refusal to accept documents",
    other: "Other",
  },
};

interface Attachment extends ValidatedFile {
  id: string;
  previewUrl: string | null;
  text: string;
  includeText: boolean;
  status: "reading" | "ready" | "error";
  error?: string;
  truncated?: boolean;
}

export default function GRSPage() {
  const { lang } = useLanguage();
  const t = copy[lang];

  const [incidentDate, setIncidentDate] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<ComplaintCategory>("delay");
  const [officialRef, setOfficialRef] = useState("");
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);

  const [questions, setQuestions] = useState<MissingDetail[]>([]);
  const [showQuestions, setShowQuestions] = useState(false);
  const [draft, setDraft] = useState<ComplaintDraft | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const [micStatus, setMicStatus] = useState<"idle" | "loading" | "recording" | "transcribing" | "error">("idle");
  const [micError, setMicError] = useState("");
  const [transcript, setTranscript] = useState("");
  const recorderRef = useRef<LocalSpeechRecorder | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<Attachment[]>([]);
  attachmentsRef.current = attachments;

  const form = useMemo(
    () => ({ incidentDate, location, category, officialRef, description, details }),
    [incidentDate, location, category, officialRef, description, details]
  );

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      for (const attachment of attachmentsRef.current) releasePreviewUrl(attachment.previewUrl);
    };
  }, []);

  const rejectionMessage = (reason: string): string => {
    const map: Record<string, string> = {
      too_large: t.fileTooLarge,
      unsupported_type: t.fileUnsupported,
      malformed: t.fileMalformed,
      empty: t.fileEmpty,
      limit_reached: t.fileLimit,
      duplicate: t.fileDuplicate,
    };
    return map[reason] ?? t.fileUnsupported;
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const result = await validateFiles(Array.from(files), {
      maxFiles: MAX_ATTACHMENTS,
      maxBytesPerFile: MAX_FILE_BYTES,
      acceptedKinds: ["image", "pdf"],
      currentCount: attachments.length,
      existingHashes: new Set(attachments.map((item) => item.hash)),
    });
    setRejections(result.rejected.map((item) => `${item.name} — ${rejectionMessage(item.reason)}`));

    for (const accepted of result.accepted) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = accepted.kind === "image" ? URL.createObjectURL(accepted.file) : null;
      const attachment: Attachment = {
        ...accepted,
        id,
        previewUrl,
        text: "",
        includeText: true,
        status: "reading",
      };
      setAttachments((previous) => [...previous, attachment]);

      try {
        const extracted = await extractDocumentText(accepted.file, accepted.kind as FileKind);
        setAttachments((previous) =>
          previous.map((item) =>
            item.id === id
              ? { ...item, status: "ready", text: extracted.text, truncated: extracted.truncated }
              : item
          )
        );
      } catch {
        setAttachments((previous) =>
          previous.map((item) =>
            item.id === id
              ? { ...item, status: "error", error: t.fileMalformed }
              : item
          )
        );
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((previous) => {
      const target = previous.find((item) => item.id === id);
      releasePreviewUrl(target?.previewUrl);
      return previous.filter((item) => item.id !== id);
    });
  };

  const updateAttachmentText = (id: string, text: string) => {
    setAttachments((previous) =>
      previous.map((item) => (item.id === id ? { ...item, text } : item))
    );
  };

  const toggleAttachmentText = (id: string, includeText: boolean) => {
    setAttachments((previous) =>
      previous.map((item) => (item.id === id ? { ...item, includeText } : item))
    );
  };

  const startRecording = async () => {
    setMicError("");
    setTranscript("");
    if (!isSpeechSupported()) {
      setMicError(t.micUnsupported);
      return;
    }
    const installed = await isSpeechModelInstalled();
    if (!installed) {
      setMicError(t.micModelMissing);
      return;
    }
    const recorder = new LocalSpeechRecorder();
    recorderRef.current = recorder;
    try {
      setMicStatus("loading");
      await recorder.start();
      setMicStatus("recording");
    } catch (error) {
      setMicStatus("error");
      recorderRef.current = null;
      if (error instanceof SpeechError) {
        setMicError(
          error.code === "permission_denied"
            ? t.micPermission
            : error.code === "unsupported"
              ? t.micUnsupported
              : t.micFailed
        );
      } else {
        setMicError(t.micFailed);
      }
    }
  };

  const stopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      setMicStatus("transcribing");
      const samples = await recorder.stop();
      const text = await transcribeLocally(samples, { language: lang === "bn" ? "bn" : "en" });
      setTranscript(text);
      setMicError("");
    } catch (error) {
      setMicStatus("error");
      setMicError(
        error instanceof SpeechError && error.code === "no_speech" ? t.micNoSpeech : t.micFailed
      );
    } finally {
      recorderRef.current = null;
      if (micStatus !== "error") setMicStatus("idle");
    }
  };

  const useTranscript = () => {
    if (!transcript.trim()) return;
    setDescription((previous) => (previous.trim() ? `${previous.trim()}\n${transcript.trim()}` : transcript.trim()));
    setTranscript("");
  };

  const evaluate = () => {
    const missing = findMissingDetails(form);
    setQuestions(missing);
    setShowQuestions(missing.length > 0);
    return missing;
  };

  /**
   * Answers to the follow-up questions. The three core gaps are written back
   * into the main fields so the draft and the form never disagree.
   */
  const setDetail = (id: string, value: string) => {
    if (id === "incident_date") setIncidentDate(value);
    else if (id === "location") setLocation(value);
    else if (id === "description") setDescription(value);
    else setDetails((previous) => ({ ...previous, [id]: value }));
  };

  const generate = () => {
    const missing = evaluate();
    const requiredMissing = missing.filter((item) => item.required);
    if (requiredMissing.length > 0) {
      setDraft(null);
      return;
    }
    const created = buildDraft(form, {
      language: lang,
      attachmentNames: attachments.map((item) => item.name),
      attachments: attachments
        .filter((item) => item.includeText && item.text.trim())
        .map((item) => ({ name: item.name, text: item.text })),
    });
    setDraft(created);
    setDraftBody(created.body);
    setCopied(false);
    setCopyError("");
  };

  const copyDraft = async () => {
    if (!draft) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draftBody}\n\n${draft.disclaimer}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(t.copyError);
    }
  };

  const reset = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setIncidentDate("");
    setLocation("");
    setCategory("delay");
    setOfficialRef("");
    setDescription("");
    setDetails({});
    setAttachments((previous) => {
      for (const attachment of previous) releasePreviewUrl(attachment.previewUrl);
      return [];
    });
    setRejections([]);
    setQuestions([]);
    setShowQuestions(false);
    setDraft(null);
    setDraftBody("");
    setTranscript("");
    setMicError("");
    setMicStatus("idle");
    setCopied(false);
    setCopyError("");
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 print:hidden">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-2 text-slate-600">{t.intro}</p>
          </div>
        </header>

        <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 print:hidden">
          <p>{t.privacy}</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              generate();
            }}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden"
          >
            <label className="block text-sm font-semibold text-slate-800">
              {t.date} <span className="text-xs font-normal text-slate-500">({t.required})</span>
              <input
                type="date"
                value={incidentDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setIncidentDate(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-800">
              {t.location} <span className="text-xs font-normal text-slate-500">({t.required})</span>
              <input
                value={location}
                maxLength={200}
                onChange={(event) => setLocation(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-800">
              {t.category} <span className="text-xs font-normal text-slate-500">({t.required})</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as ComplaintCategory)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
              >
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[lang][value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-800">
              {t.reference} <span className="text-xs font-normal text-slate-500">({t.optional})</span>
              <input
                value={officialRef}
                maxLength={200}
                onChange={(event) => setOfficialRef(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
              />
            </label>

            <div>
              <label htmlFor="complaint-description" className="block text-sm font-semibold text-slate-800">
                {t.description} <span className="text-xs font-normal text-slate-500">({t.required})</span>
              </label>
              <div className="mt-2 flex gap-2">
                <textarea
                  id="complaint-description"
                  rows={6}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                />
                <button
                  type="button"
                  onClick={() => (micStatus === "recording" ? void stopRecording() : void startRecording())}
                  aria-pressed={micStatus === "recording"}
                  aria-label={
                    micStatus === "recording"
                      ? t.micStop
                      : micStatus === "error"
                        ? t.micFailed
                        : t.mic
                  }
                  className={`h-11 w-11 shrink-0 rounded-lg border flex items-center justify-center text-xs font-semibold ${
                    micStatus === "recording"
                      ? "border-red-600 bg-red-50 text-red-700"
                      : micStatus === "error"
                        ? "border-amber-600 bg-amber-50 text-amber-700"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {micStatus === "recording" ? (
                    <StopCircle size={18} />
                  ) : micStatus === "error" || micStatus === "idle" && micError ? (
                    <AlertCircle size={18} />
                  ) : (
                    <Mic size={18} />
                  )}
                  {micStatus === "loading" && <Loader2 size={14} className="animate-spin" />}
                  <span className="sr-only">
                    {micStatus === "recording" ? t.micStop : micStatus === "loading" ? t.micLoading : t.mic}
                  </span>
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {micStatus === "recording"
                  ? t.micRecording
                  : micStatus === "transcribing"
                    ? t.micTranscribing
                    : micStatus === "loading"
                      ? t.micLoading
                      : micStatus === "error"
                        ? micError || t.micFailed
                        : t.mic}
              </p>
              {micError && (
                <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  {micError}
                </p>
              )}
              {transcript && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">{t.micTranscript}</p>
                  <textarea
                    rows={4}
                    value={transcript}
                    onChange={(event) => setTranscript(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={useTranscript}
                      className="min-h-10 rounded-lg bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white"
                    >
                      {t.micUse}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTranscript("")}
                      className="min-h-10 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    >
                      {t.micDiscard}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-800">{t.attachments}</legend>
              <p className="mb-2 text-xs text-slate-600">{t.attachmentHint}</p>
              <input
                ref={fileInputRef}
                id="complaint-attachments"
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                multiple
                onChange={(event) => void addFiles(event.target.files)}
                className="block w-full text-sm"
              />
              {rejections.length > 0 && (
                <ul role="alert" className="mt-2 space-y-1 text-xs text-red-700">
                  {rejections.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              <ul className="mt-3 space-y-3">
                {attachments.map((attachment) => (
                  <li key={attachment.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      {attachment.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          className="h-14 w-14 rounded object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600">
                          PDF
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{attachment.name}</p>
                        <p className="text-xs text-slate-600">
                          {attachment.kind === "pdf" ? "PDF" : "ছবি"} · {formatBytes(attachment.size)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="mt-1 text-xs font-medium text-red-700 underline"
                        >
                          {t.removeFile}
                        </button>
                      </div>
                    </div>
                    {attachment.status === "reading" && (
                      <p role="status" className="mt-2 text-xs text-slate-600">
                        {t.reading}
                      </p>
                    )}
                    {attachment.status === "error" && (
                      <p role="alert" className="mt-2 text-xs text-red-700">
                        {attachment.error}
                      </p>
                    )}
                    {attachment.status === "ready" && attachment.text && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-2">
                        <p className="text-xs font-semibold text-slate-700">{t.extractedText}</p>
                        <p className="mt-1 text-xs text-slate-600">{t.extractedHint}</p>
                        {attachment.truncated && (
                          <p className="mt-1 text-xs text-amber-700">{t.truncated}</p>
                        )}
                        <textarea
                          rows={3}
                          value={attachment.text}
                          onChange={(event) => updateAttachmentText(attachment.id, event.target.value)}
                          className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                        <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={attachment.includeText}
                            onChange={(event) => toggleAttachmentText(attachment.id, event.target.checked)}
                            className="h-4 w-4 accent-indigo-700"
                          />
                          {t.includeText}
                        </label>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </fieldset>

            <button
              type="submit"
              className="min-h-11 w-full rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800"
            >
              {t.generate}
            </button>
          </form>

          <div className="space-y-4">
            {showQuestions && questions.length > 0 && (
              <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 print:hidden">
                <h2 className="text-lg font-bold text-amber-900">{t.questionsTitle}</h2>
                <p className="mt-1 text-sm text-amber-900">{t.questionsHint}</p>
                <div className="mt-4 space-y-3">
                  {questions.map((question) => (
                    <label key={question.id} className="block text-sm font-semibold text-slate-800">
                      {lang === "bn" ? question.questionBn : question.questionEn}
                      <input
                        required={question.required}
                        value={
                          question.id === "incident_date"
                            ? incidentDate
                            : question.id === "location"
                              ? location
                              : question.id === "description"
                                ? description
                                : details[question.id] ?? ""
                        }
                        onChange={(event) => setDetail(question.id, event.target.value)}
                        className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={generate}
                  className="mt-4 min-h-11 w-full rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white"
                >
                  {t.generate}
                </button>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-xl font-bold text-slate-900">{t.draftTitle}</h2>
              {draft ? (
                <>
                  <h3 className="font-semibold text-slate-900">{draft.subject}</h3>
                  <label htmlFor="draft-body" className="sr-only">
                    {t.draftTitle}
                  </label>
                  <textarea
                    id="draft-body"
                    rows={18}
                    value={draftBody}
                    onChange={(event) => setDraftBody(event.target.value)}
                    className="mt-3 w-full whitespace-pre-wrap rounded-lg border border-slate-300 px-3 py-2 text-sm leading-7"
                  />
                  <p className="mt-1 text-xs text-slate-500">{t.draftHint}</p>
                  {draft.placeholders.length > 0 && (
                    <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                      {t.placeholders}: {draft.placeholders.join(", ")}
                    </p>
                  )}
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{draft.disclaimer}</p>
                  <div className="mt-4 flex flex-wrap gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={copyDraft}
                      className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white"
                    >
                      {copied ? t.copied : t.copy}
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-medium"
                    >
                      {t.print}
                    </button>
                    <button
                      type="button"
                      onClick={reset}
                      className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-medium"
                    >
                      {t.reset}
                    </button>
                    <a
                      href={draft.portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2 font-medium"
                    >
                      {t.portal}
                    </a>
                  </div>
                  {copyError && (
                    <p role="alert" className="mt-3 text-sm text-red-700">
                      {copyError}
                    </p>
                  )}
                </>
              ) : (
                <p className="py-8 text-center text-slate-500">{t.draftEmpty}</p>
              )}
            </section>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-500 print:hidden">{t.disclaimer}</p>
      </div>
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          main { padding: 0 !important; }
          form { display: none !important; }
          section { border: 0 !important; box-shadow: none !important; }
        }
      `}</style>
    </main>
  );
}
