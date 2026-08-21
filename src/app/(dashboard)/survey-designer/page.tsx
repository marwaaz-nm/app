"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Bold,
  Download,
  FileText,
  GripVertical,
  Italic,
  Loader2,
  Map,
  Move,
  RotateCcw,
  Save,
  Trash2,
  Underline,
} from "lucide-react";
import L from "leaflet";
import { supabase } from "@/lib/supabase";
import {
  useSettings,
  type SurveyPdfDesignSettings,
} from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import type { Survey } from "@/types";

type Point = { x: number; y: number };
type BlockId =
  | "header"
  | "title"
  | "summary"
  | "boundaries"
  | "sketch"
  | "notes"
  | "signatures"
  | "mapTitle"
  | "map"
  | "mapDetails"
  | "footer";
type Design = SurveyPdfDesignSettings & {
  fontSizes: {
    title: number;
    subtitle: number;
    body: number;
    section: number;
    footer: number;
  };
  positions: Record<BlockId, Point>;
  sketchSize: { width: number; height: number };
  mapSize: { width: number; height: number };
  textStyles: NonNullable<SurveyPdfDesignSettings["textStyles"]>;
  tableStyle: NonNullable<SurveyPdfDesignSettings["tableStyle"]>;
  mapDetailsStyle: NonNullable<SurveyPdfDesignSettings["mapDetailsStyle"]>;
  deletedBlocks: string[];
};

const defaultPositions: Record<BlockId, Point> = {
  header: { x: 7, y: 4 },
  title: { x: 8, y: 15 },
  summary: { x: 7, y: 24 },
  boundaries: { x: 7, y: 43 },
  sketch: { x: 7, y: 60 },
  notes: { x: 7, y: 84 },
  signatures: { x: 7, y: 91 },
  mapTitle: { x: 7, y: 5 },
  map: { x: 7, y: 14 },
  mapDetails: { x: 7, y: 80 },
  footer: { x: 7, y: 96 },
};
const defaultDesign: Design = {
  title: "LAND SURVEY REPORT",
  subtitle: "Warbixinta Sahanka Dhulka",
  accent: "#2563eb",
  font: "Arial",
  density: "comfortable",
  showLogo: true,
  showFooter: true,
  sections: {
    summary: true,
    boundaries: true,
    sketch: true,
    certification: true,
  },
  notes: "",
  fontSizes: { title: 25, subtitle: 12, body: 12, section: 11, footer: 8 },
  positions: defaultPositions,
  sketchSize: { width: 100, height: 230 },
  mapSize: { width: 100, height: 650 },
  textStyles: {},
  tableStyle: {
    headerFill: "#f1f5f9",
    headerText: "#0f172a",
    bodyFill: "#ffffff",
    bodyText: "#1e293b",
    fontSize: 12,
    borderColor: "#334155",
    borderWidth: 1,
    cells: {},
  },
  mapDetailsStyle: {
    fill: "#f8fafc",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    textColor: "#1e293b",
    fontSize: 12,
    cells: {},
  },
  deletedBlocks: [],
};
const sampleSurvey: Survey = {
  id: 0,
  serial_no: 1,
  survey_no: "SURV-0001",
  owner_name: "Magaca Milkiilaha",
  neighborhood: "Xaafadda",
  branch: "Laanta 1aad",
  vicinity: "Aagga dhulka",
  land_type: "Dhul Banaan",
  gps_location: "3.115662, 43.649544",
  sketch_area: "274.46 m²",
  boundary_w_val: "25 m",
  boundary_w_neighbor: "Deriska Waqooyi",
  boundary_b_val: "15 m",
  boundary_b_neighbor: "Deriska Bari",
  boundary_k_val: "25 m",
  boundary_k_neighbor: "Deriska Koonfur",
  boundary_g_val: "15 m",
  boundary_g_neighbor: "Deriska Galbeed",
  polygon_boundary:
    "3.1159,43.6492;3.1159,43.6498;3.1154,43.6498;3.1154,43.6492",
  created_at: new Date().toISOString(),
};

function mergeDesign(saved: SurveyPdfDesignSettings): Design {
  return {
    ...defaultDesign,
    ...saved,
    sections: { ...defaultDesign.sections, ...saved.sections },
    fontSizes: { ...defaultDesign.fontSizes, ...saved.fontSizes },
    positions: { ...defaultPositions, ...(saved.positions || {}) } as Record<
      BlockId,
      Point
    >,
    sketchSize: { ...defaultDesign.sketchSize, ...saved.sketchSize },
    mapSize: { ...defaultDesign.mapSize, ...saved.mapSize },
    textStyles: { ...defaultDesign.textStyles, ...saved.textStyles },
    tableStyle: {
      ...defaultDesign.tableStyle,
      ...saved.tableStyle,
      cells: { ...defaultDesign.tableStyle.cells, ...saved.tableStyle?.cells },
    },
    mapDetailsStyle: {
      ...defaultDesign.mapDetailsStyle,
      ...saved.mapDetailsStyle,
      cells: {
        ...defaultDesign.mapDetailsStyle.cells,
        ...saved.mapDetailsStyle?.cells,
      },
    },
    deletedBlocks: saved.deletedBlocks || [],
  };
}

const textChoices = [
  ["title", "Cinwaanka weyn"],
  ["subtitle", "Cinwaan-hoose"],
  ["orgSo", "Magaca Nootaayada"],
  ["orgEn", "Magaca English"],
  ["section1", "Section 01"],
  ["section2", "Section 02"],
  ["section3", "Section 03"],
  ["mapTitle", "Map title"],
  ["mapSubtitle", "Map subtitle"],
  ["footer", "Footer"],
] as const;
const blockChoices: [BlockId, string][] = [
  ["header", "Header & Logo"],
  ["title", "Main title"],
  ["summary", "General information"],
  ["boundaries", "Boundaries table"],
  ["sketch", "Site sketch"],
  ["notes", "Extra notes"],
  ["signatures", "Signatures"],
  ["mapTitle", "Map page title"],
  ["map", "Satellite map"],
  ["mapDetails", "Map details"],
  ["footer", "Footer"],
];
const textKeysByBlock: Record<BlockId, string[]> = {
  header: ["orgSo", "orgEn"],
  title: ["title", "subtitle"],
  summary: ["section1"],
  boundaries: ["section2"],
  sketch: ["section3"],
  notes: [],
  signatures: [],
  mapTitle: ["mapTitle", "mapSubtitle"],
  map: [],
  mapDetails: [],
  footer: ["footer"],
};
const textValue = (
  key: string,
  design: Design,
  settings: { org_name_so: string; org_name_en: string }
) =>
  ({
    title: design.title,
    subtitle: design.subtitle,
    orgSo: settings.org_name_so,
    orgEn: settings.org_name_en,
    section1: "01 · Xogta Guud / General Information",
    section2: "02 · Xuduudaha & Cabbirrada",
    section3: "03 · Naqshadda Dhulka / Site Sketch",
    mapTitle: "SATELLITE LOCATION MAP",
    mapSubtitle: "Khariidadda iyo goobta dhulka",
    footer: `Generated by ${settings.org_name_en}`,
  }[key] || "");
function StyledText({
  text,
  styleKey,
  design,
  className = "",
}: {
  text: string;
  styleKey: string;
  design: Design;
  className?: string;
}) {
  const style = design.textStyles[styleKey] || {};
  return (
    <span
      className={className}
      style={{
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.bold ? 700 : undefined,
        fontStyle: style.italic ? "italic" : undefined,
        textDecoration: style.underline ? "underline" : undefined,
      }}
    >
      {text.split(/(\s+)/).map((word, index) => {
        const custom = style.words?.[String(index)];
        return (
          <span
            key={index}
            style={{
              color: custom?.color,
              fontSize: custom?.fontSize,
              fontWeight: custom?.bold ? 700 : undefined,
              fontStyle: custom?.italic ? "italic" : undefined,
              textDecoration: custom?.underline ? "underline" : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </span>
  );
}
function coords(value?: string | null): [number, number][] {
  if (!value) return [];
  return [
    ...value.matchAll(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/g),
  ].map((m) => [Number(m[1]), Number(m[2])]);
}
function Draggable({
  id,
  design,
  editable,
  onMove,
  children,
  className = "",
}: {
  id: BlockId;
  design: Design;
  editable: boolean;
  onMove: (id: BlockId, p: Point) => void;
  children: ReactNode;
  className?: string;
}) {
  if (design.deletedBlocks.includes(id)) return null;
  const point = design.positions[id];
  const start = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable) return;
    event.preventDefault();
    const page = event.currentTarget.parentElement?.parentElement;
    if (!page) return;
    const rect = page.getBoundingClientRect(),
      sx = event.clientX,
      sy = event.clientY,
      original = point;
    const move = (e: PointerEvent) =>
      onMove(id, {
        x: Math.max(
          0,
          Math.min(94, original.x + ((e.clientX - sx) / rect.width) * 100)
        ),
        y: Math.max(
          0,
          Math.min(96, original.y + ((e.clientY - sy) / rect.height) * 100)
        ),
      });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  return (
    <div
      data-pdf-block={id}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("pdf-block-select", { detail: id })
        )
      }
      className={`absolute cursor-pointer transition-shadow ${className}`}
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
    >
      {editable && (
        <button
          type="button"
          onPointerDown={start}
          className="pdf-drag-handle absolute -left-6 top-0 z-20 flex h-6 w-6 cursor-move items-center justify-center rounded-md bg-slate-900 text-white shadow"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </div>
  );
}
function PlotSketch({
  survey,
  accent,
  height,
}: {
  survey: Survey;
  accent: string;
  height: number;
}) {
  const shape =
    coords(survey.polygon_boundary).length >= 3
      ? coords(survey.polygon_boundary)
      : coords(sampleSurvey.polygon_boundary);
  const xs = shape.map((p) => p[1]),
    ys = shape.map((p) => p[0]),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const mapped = shape
    .map(
      ([lat, lng]) =>
        `${35 + ((lng - minX) / (maxX - minX || 1)) * 530},${
          245 - ((lat - minY) / (maxY - minY || 1)) * 205
        }`
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 600 280"
      style={{ height }}
      className="w-full rounded-lg border bg-slate-50"
    >
      <defs>
        <pattern
          id="pdf-grid"
          width="25"
          height="25"
          patternUnits="userSpaceOnUse"
        >
          <path d="M25 0H0V25" fill="none" stroke="#cbd5e1" strokeWidth=".6" />
        </pattern>
      </defs>
      <rect width="600" height="280" fill="url(#pdf-grid)" />
      <polygon
        points={mapped}
        fill={`${accent}22`}
        stroke={accent}
        strokeWidth="4"
      />
      {shape.map((_, i) => {
        const [x, y] = mapped.split(" ")[i].split(",");
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r="5"
              fill="white"
              stroke={accent}
              strokeWidth="3"
            />
            <text
              x={Number(x) + 8}
              y={Number(y) - 7}
              fontSize="11"
              fontWeight="700"
            >
              P{i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
function SurveyMap({
  survey,
  accent,
  height,
}: {
  survey: Survey;
  accent: string;
  height: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const gps = coords(survey.gps_location)[0] || [3.115662, 43.649544];
    const map = L.map(ref.current, {
      center: gps,
      zoom: 18,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
    });
    L.tileLayer("https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", {
      maxZoom: 22,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
      crossOrigin: true,
    }).addTo(map);
    const polygon = coords(survey.polygon_boundary);
    if (polygon.length >= 3)
      L.polygon(polygon, { color: accent, weight: 4, fillOpacity: 0.16 })
        .addTo(map)
        .bindTooltip(survey.owner_name, {
          permanent: true,
          direction: "center",
        });
    L.circleMarker(gps, {
      radius: 7,
      color: "#fff",
      weight: 3,
      fillColor: accent,
      fillOpacity: 1,
    }).addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      map.remove();
    };
  }, [survey, accent]);
  return (
    <div
      ref={ref}
      style={{ height }}
      className="w-full overflow-hidden rounded-lg border-2 border-slate-300 bg-slate-100"
    />
  );
}

export default function SurveyDesignerPage() {
  const { settings, refetch } = useSettings();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "Admin" || profile?.role === "SuperAdmin";
  const [design, setDesign] = useState<Design>(() =>
    mergeDesign(settings.survey_pdf_design)
  );
  const [survey, setSurvey] = useState<Survey>(sampleSurvey);
  const [saving, setSaving] = useState(false),
    [exporting, setExporting] = useState(false),
    [message, setMessage] = useState("");
  const [selectedText, setSelectedText] = useState("title"),
    [selectedWord, setSelectedWord] = useState("0"),
    [selectedCell, setSelectedCell] = useState("h0"),
    [selectedMapDetailCell, setSelectedMapDetailCell] = useState("owner"),
    [selectedElement, setSelectedElement] = useState<BlockId>("title");
  const page1Ref = useRef<HTMLDivElement>(null),
    page2Ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Shared settings may finish loading after this editor mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesign(mergeDesign(settings.survey_pdf_design));
  }, [settings.survey_pdf_design]);
  useEffect(() => {
    const id = Number(
      new URLSearchParams(window.location.search).get("survey")
    );
    if (!id) return;
    void supabase
      .from("surveys")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        if (data) setSurvey(data as Survey);
      });
  }, []);
  useEffect(() => {
    const onBlockSelect = (event: Event) => {
      const block = (event as CustomEvent<BlockId>).detail;
      setSelectedElement(block);
      const textKey = textKeysByBlock[block][0];
      if (textKey) {
        setSelectedText(textKey);
        setSelectedWord("0");
      }
      document
        .querySelectorAll<HTMLElement>("[data-pdf-block]")
        .forEach((element) => {
          element.style.outline =
            element.dataset.pdfBlock === block ? "2px solid #f59e0b" : "";
          element.style.outlineOffset =
            element.dataset.pdfBlock === block ? "4px" : "";
        });
      document
        .getElementById("context-editor")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const onCellSelect = (event: Event) => {
      setSelectedCell((event as CustomEvent<string>).detail);
      setSelectedElement("boundaries");
      document
        .getElementById("context-editor")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const onMapDetailCellSelect = (event: Event) => {
      setSelectedMapDetailCell((event as CustomEvent<string>).detail);
      setSelectedElement("mapDetails");
      document
        .getElementById("context-editor")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("pdf-block-select", onBlockSelect);
    window.addEventListener("pdf-cell-select", onCellSelect);
    window.addEventListener(
      "pdf-map-detail-cell-select",
      onMapDetailCellSelect
    );
    return () => {
      window.removeEventListener("pdf-block-select", onBlockSelect);
      window.removeEventListener("pdf-cell-select", onCellSelect);
      window.removeEventListener(
        "pdf-map-detail-cell-select",
        onMapDetailCellSelect
      );
    };
  }, []);
  const update = <K extends keyof Design>(key: K, value: Design[K]) =>
    setDesign((d) => ({ ...d, [key]: value }));
  const move = (id: BlockId, p: Point) =>
    setDesign((d) => ({ ...d, positions: { ...d.positions, [id]: p } }));
  const fontSize = (key: keyof Design["fontSizes"], value: number) =>
    setDesign((d) => ({ ...d, fontSizes: { ...d.fontSizes, [key]: value } }));
  const setTextStyle = (patch: {
    color?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  }) =>
    setDesign((d) => ({
      ...d,
      textStyles: {
        ...d.textStyles,
        [selectedText]: { ...d.textStyles[selectedText], ...patch },
      },
    }));
  const setWordStyle = (patch: {
    color?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  }) =>
    setDesign((d) => {
      const base = d.textStyles[selectedText] || {};
      return {
        ...d,
        textStyles: {
          ...d.textStyles,
          [selectedText]: {
            ...base,
            words: {
              ...base.words,
              [selectedWord]: { ...base.words?.[selectedWord], ...patch },
            },
          },
        },
      };
    });
  const setCellStyle = (patch: {
    fill?: string;
    color?: string;
    fontSize?: number;
    borderColor?: string;
    borderWidth?: number;
  }) =>
    setDesign((d) => ({
      ...d,
      tableStyle: {
        ...d.tableStyle,
        cells: {
          ...d.tableStyle.cells,
          [selectedCell]: { ...d.tableStyle.cells[selectedCell], ...patch },
        },
      },
    }));
  const setMapDetailCellStyle = (patch: {
    fill?: string;
    color?: string;
    fontSize?: number;
  }) =>
    setDesign((d) => ({
      ...d,
      mapDetailsStyle: {
        ...d.mapDetailsStyle,
        cells: {
          ...d.mapDetailsStyle.cells,
          [selectedMapDetailCell]: {
            ...d.mapDetailsStyle.cells[selectedMapDetailCell],
            ...patch,
          },
        },
      },
    }));
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Fadlan dib u gal.");
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ survey_pdf_design: design }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Template-ka lama kaydin.");
      await refetch();
      setMessage("Template-ka guud waa la kaydiyey.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Template-ka lama kaydin."
      );
    } finally {
      setSaving(false);
    }
  };
  const download = async () => {
    if (!page1Ref.current || !page2Ref.current) return;
    setExporting(true);
    const selectedNodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-pdf-block]")
    );
    selectedNodes.forEach((element) => {
      element.style.outline = "";
      element.style.outlineOffset = "";
    });
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const pdf = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      });
      for (const [index, page] of [
        page1Ref.current,
        page2Ref.current,
      ].entries()) {
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#fff",
        });
        if (index) pdf.addPage("a4", "portrait");
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.98),
          "JPEG",
          0,
          0,
          210,
          297,
          undefined,
          "FAST"
        );
      }
      pdf.save(
        `Survey_${
          survey.survey_no || survey.serial_no
        }_${survey.owner_name.replace(/\W+/g, "_")}.pdf`
      );
    } finally {
      selectedNodes
        .filter((element) => element.dataset.pdfBlock === selectedElement)
        .forEach((element) => {
          element.style.outline = "2px solid #f59e0b";
          element.style.outlineOffset = "4px";
        });
      setExporting(false);
    }
  };
  const sectionTitle = (text: string, key: string) => (
    <h2
      className="mb-2 rounded-md px-3 py-2 font-black uppercase tracking-wider text-white"
      style={{ background: design.accent, fontSize: design.fontSizes.section }}
    >
      <StyledText text={text} styleKey={key} design={design} />
    </h2>
  );
  const field = (label: string, value?: string | null) => (
    <div className="border-b border-slate-200 py-1.5">
      <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="font-semibold" style={{ fontSize: design.fontSizes.body }}>
        {value || "—"}
      </p>
    </div>
  );
  return (
    <div className="min-h-full bg-slate-100 p-3 text-slate-800 md:p-6">
      <div className="mx-auto max-w-[1700px] space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/settings?tab=pdf"
              className="flex h-10 w-10 items-center justify-center rounded-xl border"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-black">Survey PDF Template Editor</h1>
              <p className="text-xs font-semibold text-slate-500">
                Hal design · Dhammaan survey PDF-yada · 2 bog A4
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!isAdmin || saving}
              className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}{" "}
              Kaydi Template-ka
            </button>
            <button
              onClick={download}
              disabled={exporting}
              className="flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-bold text-white"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}{" "}
              Test PDF
            </button>
          </div>
        </header>
        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-xs font-bold ${
              message.includes("waa la")
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {message}
          </div>
        )}
        <main className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="max-h-[calc(100vh-7rem)] space-y-5 overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm xl:sticky xl:top-4">
            <div>
              <p className="text-sm font-black">Design Settings</p>
              <p className="mt-1 text-[10px] text-slate-500">
                <Move className="mr-1 inline h-3 w-3" />
                Handle-ka madow ku dhaqaaji block kasta.
              </p>
            </div>
            <label
              className={`${
                selectedElement === "title" ? "block" : "hidden"
              } text-[10px] font-bold text-slate-500`}
            >
              CINWAANKA
              <input
                value={design.title}
                onChange={(e) => update("title", e.target.value)}
                className="mt-1 w-full rounded-lg border p-2 text-xs"
              />
            </label>
            <label
              className={`${
                selectedElement === "title" ? "block" : "hidden"
              } text-[10px] font-bold text-slate-500`}
            >
              CINWAAN-HOOSE
              <input
                value={design.subtitle}
                onChange={(e) => update("subtitle", e.target.value)}
                className="mt-1 w-full rounded-lg border p-2 text-xs"
              />
            </label>
            <div
              className={`${
                textKeysByBlock[selectedElement].length ? "grid" : "hidden"
              } grid-cols-2 gap-2`}
            >
              <label className="text-[10px] font-bold">
                MIDAB
                <input
                  type="color"
                  value={design.accent}
                  onChange={(e) => update("accent", e.target.value)}
                  className="mt-1 h-9 w-full rounded border p-1"
                />
              </label>
              <label className="text-[10px] font-bold">
                FONT
                <select
                  value={design.font}
                  onChange={(e) =>
                    update("font", e.target.value as Design["font"])
                  }
                  className="mt-1 h-9 w-full rounded border px-2 text-xs"
                >
                  <option>Arial</option>
                  <option>Georgia</option>
                  <option>Times New Roman</option>
                </select>
              </label>
            </div>
            <div className="hidden">
              <p className="text-[10px] font-black">FONT SIZES</p>
              {(
                [
                  ["title", "Cinwaan", 14, 42],
                  ["subtitle", "Cinwaan-hoose", 8, 24],
                  ["body", "Qoraalka xogta", 8, 20],
                  ["section", "Section title", 8, 20],
                  ["footer", "Footer", 6, 14],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key} className="block text-[10px] font-bold">
                  <span className="flex justify-between">
                    <span>{label}</span>
                    <b>{design.fontSizes[key]}px</b>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={design.fontSizes[key]}
                    onChange={(e) => fontSize(key, Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              ))}
            </div>
            <div className="space-y-3 border-t pt-4">
              <div
                id="context-editor"
                className="rounded-lg border border-amber-200 bg-amber-50 p-2"
              >
                <p className="text-[9px] font-bold text-amber-700">
                  HADDA LA EDIT-GAREYNAYO
                </p>
                <p className="mt-0.5 text-xs font-black text-amber-900">
                  {blockChoices.find(([key]) => key === selectedElement)?.[1]}
                </p>
              </div>
              <p className="text-[10px] font-black">DELETE / RESTORE ELEMENT</p>
              <select
                value={selectedElement}
                onChange={(e) => setSelectedElement(e.target.value as BlockId)}
                className="hidden"
              >
                {blockChoices.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {design.deletedBlocks.includes(selectedElement) ? (
                <button
                  onClick={() =>
                    update(
                      "deletedBlocks",
                      design.deletedBlocks.filter(
                        (id) => id !== selectedElement
                      )
                    )
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-50 py-2 text-xs font-bold text-emerald-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Soo celi element-ka
                </button>
              ) : (
                <button
                  onClick={() =>
                    update("deletedBlocks", [
                      ...design.deletedBlocks,
                      selectedElement,
                    ])
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-50 py-2 text-xs font-bold text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete element-ka
                </button>
              )}
              {design.deletedBlocks.length > 0 && (
                <p className="text-[9px] text-slate-500">
                  Deleted: {design.deletedBlocks.join(", ")}
                </p>
              )}
            </div>
            <div
              className={`${
                textKeysByBlock[selectedElement].length ? "block" : "hidden"
              } space-y-3 border-t pt-4`}
            >
              <p className="text-[10px] font-black">QORAAL & ERAY EDITOR</p>
              <select
                value={selectedText}
                onChange={(e) => {
                  setSelectedText(e.target.value);
                  setSelectedWord("0");
                }}
                className="w-full rounded-lg border p-2 text-xs"
              >
                {textChoices
                  .filter(([key]) =>
                    textKeysByBlock[selectedElement].includes(key)
                  )
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Color
                  label="Qoraal color"
                  value={design.textStyles[selectedText]?.color || "#0f172a"}
                  onChange={(v) => setTextStyle({ color: v })}
                />
                <NumberBox
                  label="Font size"
                  value={
                    design.textStyles[selectedText]?.fontSize ||
                    design.fontSizes.body
                  }
                  onChange={(v) => setTextStyle({ fontSize: v })}
                />
              </div>
              <StyleButtons
                value={design.textStyles[selectedText] || {}}
                onChange={setTextStyle}
              />
              <p className="text-[9px] font-bold text-slate-500">
                ERAY GAAR AH DOORO
              </p>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto rounded-lg border bg-slate-50 p-2">
                {textValue(selectedText, design, settings)
                  .split(/(\s+)/)
                  .map(
                    (word, index) =>
                      word.trim() && (
                        <button
                          key={index}
                          onClick={() => setSelectedWord(String(index))}
                          className={`rounded px-2 py-1 text-[10px] font-bold ${
                            selectedWord === String(index)
                              ? "bg-teal-600 text-white"
                              : "bg-white border"
                          }`}
                        >
                          {word}
                        </button>
                      )
                  )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Color
                  label="Eray color"
                  value={
                    design.textStyles[selectedText]?.words?.[selectedWord]
                      ?.color ||
                    design.textStyles[selectedText]?.color ||
                    "#0f172a"
                  }
                  onChange={(v) => setWordStyle({ color: v })}
                />
                <NumberBox
                  label="Eray size"
                  value={
                    design.textStyles[selectedText]?.words?.[selectedWord]
                      ?.fontSize ||
                    design.textStyles[selectedText]?.fontSize ||
                    design.fontSizes.body
                  }
                  onChange={(v) => setWordStyle({ fontSize: v })}
                />
              </div>
              <StyleButtons
                value={
                  design.textStyles[selectedText]?.words?.[selectedWord] || {}
                }
                onChange={setWordStyle}
              />
            </div>
            <div
              className={`${
                selectedElement === "boundaries" ? "block" : "hidden"
              } space-y-3 border-t pt-4`}
            >
              <p className="text-[10px] font-black">TABLE CELL STYLE</p>
              <p className="text-[9px] font-bold text-slate-500">TABLE DHAN</p>
              <div className="grid grid-cols-2 gap-2">
                <Color
                  label="Header fill"
                  value={design.tableStyle.headerFill}
                  onChange={(v) =>
                    update("tableStyle", {
                      ...design.tableStyle,
                      headerFill: v,
                    })
                  }
                />
                <Color
                  label="Body fill"
                  value={design.tableStyle.bodyFill}
                  onChange={(v) =>
                    update("tableStyle", { ...design.tableStyle, bodyFill: v })
                  }
                />
                <Color
                  label="Border color"
                  value={design.tableStyle.borderColor || "#334155"}
                  onChange={(v) =>
                    update("tableStyle", {
                      ...design.tableStyle,
                      borderColor: v,
                    })
                  }
                />
                <BorderBox
                  label="Border size"
                  value={design.tableStyle.borderWidth || 1}
                  onChange={(v) =>
                    update("tableStyle", {
                      ...design.tableStyle,
                      borderWidth: v,
                    })
                  }
                />
              </div>
              <p className="text-[9px] font-bold text-slate-500">
                CELL GAAR AH
              </p>
              <select
                value={selectedCell}
                onChange={(e) => setSelectedCell(e.target.value)}
                className="w-full rounded-lg border p-2 text-xs"
              >
                <optgroup label="Header">
                  {["Jiho", "Cabbir", "Deris / Xad"].map((v, i) => (
                    <option key={v} value={`h${i}`}>
                      {v}
                    </option>
                  ))}
                </optgroup>
                {["Waqooyi", "Bari", "Koonfur", "Galbeed"].map((row, r) => (
                  <optgroup key={row} label={row}>
                    {["Jiho", "Cabbir", "Deris"].map((col, c) => (
                      <option key={col} value={`r${r}c${c}`}>
                        {row} · {col}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Color
                  label="Cell fill"
                  value={
                    design.tableStyle.cells[selectedCell]?.fill || "#ffffff"
                  }
                  onChange={(v) => setCellStyle({ fill: v })}
                />
                <Color
                  label="Text color"
                  value={
                    design.tableStyle.cells[selectedCell]?.color || "#1e293b"
                  }
                  onChange={(v) => setCellStyle({ color: v })}
                />
              </div>
              <NumberBox
                label="Cell font size"
                value={
                  design.tableStyle.cells[selectedCell]?.fontSize ||
                  design.tableStyle.fontSize
                }
                onChange={(v) => setCellStyle({ fontSize: v })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Color
                  label="Cell border"
                  value={
                    design.tableStyle.cells[selectedCell]?.borderColor ||
                    design.tableStyle.borderColor ||
                    "#334155"
                  }
                  onChange={(v) => setCellStyle({ borderColor: v })}
                />
                <BorderBox
                  label="Border size"
                  value={
                    design.tableStyle.cells[selectedCell]?.borderWidth ||
                    design.tableStyle.borderWidth ||
                    1
                  }
                  onChange={(v) => setCellStyle({ borderWidth: v })}
                />
              </div>
            </div>
            <div
              className={`${
                selectedElement === "sketch" ? "block" : "hidden"
              } space-y-3 border-t pt-4`}
            >
              <p className="text-[10px] font-black">SKETCH RESIZE</p>
              <Range
                label="Ballac"
                value={design.sketchSize.width}
                min={35}
                max={100}
                suffix="%"
                onChange={(v) =>
                  update("sketchSize", { ...design.sketchSize, width: v })
                }
              />
              <Range
                label="Dherer"
                value={design.sketchSize.height}
                min={120}
                max={360}
                suffix="px"
                onChange={(v) =>
                  update("sketchSize", { ...design.sketchSize, height: v })
                }
              />
            </div>
            <div
              className={`${
                selectedElement === "mapDetails" ? "block" : "hidden"
              } space-y-3 border-t pt-4`}
            >
              <p className="text-[10px] font-black">MAP DETAILS STYLE</p>
              <p className="text-[9px] font-bold text-slate-500">BLOCK DHAN</p>
              <div className="grid grid-cols-2 gap-2">
                <Color
                  label="Block fill"
                  value={design.mapDetailsStyle.fill}
                  onChange={(v) =>
                    update("mapDetailsStyle", {
                      ...design.mapDetailsStyle,
                      fill: v,
                    })
                  }
                />
                <Color
                  label="Border color"
                  value={design.mapDetailsStyle.borderColor}
                  onChange={(v) =>
                    update("mapDetailsStyle", {
                      ...design.mapDetailsStyle,
                      borderColor: v,
                    })
                  }
                />
                <BorderBox
                  label="Border size"
                  value={design.mapDetailsStyle.borderWidth}
                  onChange={(v) =>
                    update("mapDetailsStyle", {
                      ...design.mapDetailsStyle,
                      borderWidth: v,
                    })
                  }
                />
                <Color
                  label="Font color"
                  value={design.mapDetailsStyle.textColor}
                  onChange={(v) =>
                    update("mapDetailsStyle", {
                      ...design.mapDetailsStyle,
                      textColor: v,
                    })
                  }
                />
              </div>
              <NumberBox
                label="Font size"
                value={design.mapDetailsStyle.fontSize}
                onChange={(v) =>
                  update("mapDetailsStyle", {
                    ...design.mapDetailsStyle,
                    fontSize: v,
                  })
                }
              />
              <p className="text-[9px] font-bold text-slate-500">
                CELL GAAR AH
              </p>
              <select
                value={selectedMapDetailCell}
                onChange={(e) => setSelectedMapDetailCell(e.target.value)}
                className="w-full rounded-lg border p-2 text-xs"
              >
                <option value="owner">Milkiilaha</option>
                <option value="gps">GPS</option>
                <option value="area">Baaxadda</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Color
                  label="Cell fill"
                  value={
                    design.mapDetailsStyle.cells[selectedMapDetailCell]?.fill ||
                    design.mapDetailsStyle.fill
                  }
                  onChange={(v) => setMapDetailCellStyle({ fill: v })}
                />
                <Color
                  label="Text color"
                  value={
                    design.mapDetailsStyle.cells[selectedMapDetailCell]
                      ?.color || design.mapDetailsStyle.textColor
                  }
                  onChange={(v) => setMapDetailCellStyle({ color: v })}
                />
              </div>
              <NumberBox
                label="Cell font size"
                value={
                  design.mapDetailsStyle.cells[selectedMapDetailCell]
                    ?.fontSize || design.mapDetailsStyle.fontSize
                }
                onChange={(v) => setMapDetailCellStyle({ fontSize: v })}
              />
            </div>
            <div
              className={`${
                selectedElement === "map" ? "block" : "hidden"
              } space-y-3 border-t pt-4`}
            >
              <p className="text-[10px] font-black">PAGE 2 MAP RESIZE</p>
              <Range
                label="Ballac"
                value={design.mapSize.width}
                min={40}
                max={100}
                suffix="%"
                onChange={(v) =>
                  update("mapSize", { ...design.mapSize, width: v })
                }
              />
              <Range
                label="Dherer"
                value={design.mapSize.height}
                min={300}
                max={780}
                suffix="px"
                onChange={(v) =>
                  update("mapSize", { ...design.mapSize, height: v })
                }
              />
            </div>
            <label
              className={`${
                selectedElement === "notes" ? "block" : "hidden"
              } text-[10px] font-bold`}
            >
              QORAAL DHEERAAD AH
              <textarea
                value={design.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border p-2 text-xs"
              />
            </label>
            <button onClick={() => setDesign(defaultDesign)} className="hidden">
              Soo celi Default
            </button>
          </aside>
          <section className="min-w-0 space-y-5 overflow-auto rounded-2xl border bg-slate-200/70 p-3 md:p-6">
            {[1, 2].map((n) => (
              <div key={n} className="mx-auto w-[794px]">
                <p className="mb-2 text-center text-[10px] font-black uppercase tracking-[.18em] text-slate-500">
                  A4 · Bogga {n}
                </p>
                <div
                  ref={n === 1 ? page1Ref : page2Ref}
                  className="survey-pdf-page relative h-[1123px] w-[794px] overflow-hidden bg-white shadow-2xl"
                  style={{ fontFamily: design.font }}
                >
                  {n === 1 ? (
                    <PageOne
                      design={design}
                      survey={survey}
                      settings={settings}
                      editable={Boolean(isAdmin)}
                      move={move}
                      field={field}
                      sectionTitle={sectionTitle}
                    />
                  ) : (
                    <PageTwo
                      design={design}
                      survey={survey}
                      editable={Boolean(isAdmin)}
                      move={move}
                      field={field}
                    />
                  )}{" "}
                  {design.showFooter &&
                    !design.deletedBlocks.includes("footer") && (
                      <footer
                        className="absolute bottom-5 left-[7%] flex w-[86%] justify-between border-t pt-2 text-slate-400"
                        style={{ fontSize: design.fontSizes.footer }}
                      >
                        <StyledText
                          text={`Generated by ${settings.org_name_en}`}
                          styleKey="footer"
                          design={design}
                        />
                        <span>Bogga {n} / 2</span>
                      </footer>
                    )}
                </div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-[10px] font-bold">
      <span className="flex justify-between">
        <span>{label}</span>
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}
function Color({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-[9px] font-bold">
      {label}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded border p-1"
      />
    </label>
  );
}
function NumberBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-[9px] font-bold">
      {label}
      <input
        type="number"
        min="6"
        max="72"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-9 w-full rounded border px-2 text-xs"
      />
    </label>
  );
}
function StyleButtons({
  value,
  onChange,
}: {
  value: { bold?: boolean; italic?: boolean; underline?: boolean };
  onChange: (patch: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  }) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      <button
        type="button"
        title="Bold"
        onClick={() => onChange({ bold: !value.bold })}
        className={`flex h-9 items-center justify-center rounded border ${
          value.bold ? "bg-slate-900 text-white" : "bg-white"
        }`}
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Italic"
        onClick={() => onChange({ italic: !value.italic })}
        className={`flex h-9 items-center justify-center rounded border ${
          value.italic ? "bg-slate-900 text-white" : "bg-white"
        }`}
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        type="button"
        title="Underline"
        onClick={() => onChange({ underline: !value.underline })}
        className={`flex h-9 items-center justify-center rounded border ${
          value.underline ? "bg-slate-900 text-white" : "bg-white"
        }`}
      >
        <Underline className="h-4 w-4" />
      </button>
    </div>
  );
}
function BorderBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-[9px] font-bold">
      {label}
      <input
        type="number"
        min="0"
        max="10"
        step="0.5"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-9 w-full rounded border px-2 text-xs"
      />
    </label>
  );
}
function cellStyle(design: Design, key: string, header = false) {
  const custom = design.tableStyle.cells[key] || {};
  return {
    backgroundColor:
      custom.fill ||
      (header ? design.tableStyle.headerFill : design.tableStyle.bodyFill),
    color:
      custom.color ||
      (header ? design.tableStyle.headerText : design.tableStyle.bodyText),
    fontSize: custom.fontSize || design.tableStyle.fontSize,
    borderColor: custom.borderColor || design.tableStyle.borderColor,
    borderWidth: custom.borderWidth || design.tableStyle.borderWidth,
    borderStyle: "solid",
  };
}
function selectCell(event: ReactMouseEvent, key: string) {
  event.stopPropagation();
  window.dispatchEvent(new CustomEvent("pdf-cell-select", { detail: key }));
  window.dispatchEvent(
    new CustomEvent("pdf-block-select", { detail: "boundaries" })
  );
}
type PageProps = {
  design: Design;
  survey: Survey;
  editable: boolean;
  move: (id: BlockId, p: Point) => void;
  field: (l: string, v?: string | null) => ReactNode;
};
function PageOne({
  design,
  survey,
  settings,
  editable,
  move,
  field,
  sectionTitle,
}: PageProps & {
  settings: {
    logo_url: string | null;
    org_name_so: string;
    org_name_en: string;
  };
  sectionTitle: (t: string, key: string) => ReactNode;
}) {
  return (
    <>
      <Draggable
        id="header"
        design={design}
        editable={editable}
        onMove={move}
        className="w-[86%]"
      >
        <div
          className="flex justify-between border-b-4 pb-4"
          style={{ borderColor: design.accent }}
        >
          <div className="flex items-center gap-3">
            {design.showLogo && settings.logo_url ? (
              <Image
                src={settings.logo_url}
                alt="Logo"
                width={58}
                height={58}
                unoptimized
              />
            ) : (
              <span
                className="flex h-14 w-14 items-center justify-center rounded-xl text-white"
                style={{ background: design.accent }}
              >
                <FileText />
              </span>
            )}
            <div>
              <b className="text-lg">
                <StyledText
                  text={settings.org_name_so}
                  styleKey="orgSo"
                  design={design}
                />
              </b>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                <StyledText
                  text={settings.org_name_en}
                  styleKey="orgEn"
                  design={design}
                />
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold text-slate-400">SURVEY NO.</p>
            <b className="text-xl" style={{ color: design.accent }}>
              #{survey.survey_no || survey.serial_no}
            </b>
          </div>
        </div>
      </Draggable>
      <Draggable
        id="title"
        design={design}
        editable={editable}
        onMove={move}
        className="w-[84%] text-center"
      >
        <h1 className="font-black" style={{ fontSize: design.fontSizes.title }}>
          <StyledText text={design.title} styleKey="title" design={design} />
        </h1>
        <p
          style={{ fontSize: design.fontSizes.subtitle, color: design.accent }}
        >
          <StyledText
            text={design.subtitle}
            styleKey="subtitle"
            design={design}
          />
        </p>
      </Draggable>
      {design.sections.summary && (
        <Draggable
          id="summary"
          design={design}
          editable={editable}
          onMove={move}
          className="w-[86%]"
        >
          {sectionTitle("01 · Xogta Guud / General Information", "section1")}
          <div className="grid grid-cols-2 gap-x-8">
            {field("Magaca Milkiilaha", survey.owner_name)}
            {field("Nooca Dhulka", survey.land_type)}
            {field("Xaafadda", survey.neighborhood)}
            {field("Laanta", survey.branch)}
            {field("Aagga", survey.vicinity)}
            {field("GPS", survey.gps_location)}
            {field("Baaxadda", survey.sketch_area)}
            {field("Dhismaha", survey.built_details)}
          </div>
        </Draggable>
      )}
      {design.sections.boundaries && (
        <Draggable
          id="boundaries"
          design={design}
          editable={editable}
          onMove={move}
          className="w-[86%]"
        >
          {sectionTitle("02 · Xuduudaha & Cabbirrada", "section2")}
          <table
            className="w-full border-collapse"
            style={{ fontSize: design.fontSizes.body }}
          >
            <thead>
              <tr>
                <th
                  className="border p-2"
                  style={cellStyle(design, "h0", true)}
                  onClick={(event) => selectCell(event, "h0")}
                >
                  Jiho
                </th>
                <th
                  className="border p-2"
                  style={cellStyle(design, "h1", true)}
                  onClick={(event) => selectCell(event, "h1")}
                >
                  Cabbir
                </th>
                <th
                  className="border p-2"
                  style={cellStyle(design, "h2", true)}
                  onClick={(event) => selectCell(event, "h2")}
                >
                  Deris / Xad
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Waqooyi", survey.boundary_w_val, survey.boundary_w_neighbor],
                ["Bari", survey.boundary_b_val, survey.boundary_b_neighbor],
                ["Koonfur", survey.boundary_k_val, survey.boundary_k_neighbor],
                ["Galbeed", survey.boundary_g_val, survey.boundary_g_neighbor],
              ].map((r, rowIndex) => (
                <tr key={r[0]}>
                  {r.map((v, i) => (
                    <td
                      key={i}
                      className="border p-2"
                      style={cellStyle(design, `r${rowIndex}c${i}`)}
                      onClick={(event) =>
                        selectCell(event, `r${rowIndex}c${i}`)
                      }
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Draggable>
      )}
      {design.sections.sketch && (
        <Draggable
          id="sketch"
          design={design}
          editable={editable}
          onMove={move}
          className="w-[86%]"
        >
          {sectionTitle("03 · Naqshadda Dhulka / Site Sketch", "section3")}
          <div style={{ width: `${design.sketchSize.width}%` }}>
            <PlotSketch
              survey={survey}
              accent={design.accent}
              height={design.sketchSize.height}
            />
          </div>
        </Draggable>
      )}
      {design.notes && (
        <Draggable
          id="notes"
          design={design}
          editable={editable}
          onMove={move}
          className="w-[86%]"
        >
          <div
            className="rounded border bg-slate-50 p-3"
            style={{ fontSize: design.fontSizes.body }}
          >
            {design.notes}
          </div>
        </Draggable>
      )}
      {design.sections.certification && (
        <Draggable
          id="signatures"
          design={design}
          editable={editable}
          onMove={move}
          className="grid w-[86%] grid-cols-2 gap-16 text-center text-[10px]"
        >
          <div className="border-t pt-2">Saxiixa Surveyor-ka</div>
          <div className="border-t pt-2">Shaabad & Ansixin</div>
        </Draggable>
      )}
    </>
  );
}
function PageTwo({ design, survey, editable, move }: PageProps) {
  const detailCell = (key: string, label: string, value?: string | null) => {
    const cell = design.mapDetailsStyle.cells[key] || {};
    return (
      <button
        type="button"
        onClick={(event) => {
          if (!editable) return;
          event.stopPropagation();
          window.dispatchEvent(
            new CustomEvent("pdf-map-detail-cell-select", { detail: key })
          );
        }}
        className="border-b border-slate-200 px-2 py-1.5 text-left"
        style={{
          backgroundColor: cell.fill || "transparent",
          color: cell.color || design.mapDetailsStyle.textColor,
          fontSize: cell.fontSize || design.mapDetailsStyle.fontSize,
        }}
      >
        <span className="block text-[8px] font-bold uppercase tracking-wider opacity-60">
          {label}
        </span>
        <span className="font-semibold">{value || "—"}</span>
      </button>
    );
  };
  return (
    <>
      <Draggable
        id="mapTitle"
        design={design}
        editable={editable}
        onMove={move}
        className="w-[86%]"
      >
        <div
          className="flex justify-between border-b-4 pb-4"
          style={{ borderColor: design.accent }}
        >
          <div>
            <h2
              className="flex items-center gap-2 font-black"
              style={{ fontSize: design.fontSizes.title }}
            >
              <Map />{" "}
              <StyledText
                text="SATELLITE LOCATION MAP"
                styleKey="mapTitle"
                design={design}
              />
            </h2>
            <p
              style={{
                fontSize: design.fontSizes.subtitle,
                color: design.accent,
              }}
            >
              <StyledText
                text="Khariidadda iyo goobta dhulka"
                styleKey="mapSubtitle"
                design={design}
              />
            </p>
          </div>
          <b style={{ color: design.accent }}>
            #{survey.survey_no || survey.serial_no}
          </b>
        </div>
      </Draggable>
      <Draggable
        id="map"
        design={design}
        editable={editable}
        onMove={move}
        className="w-[86%]"
      >
        <div style={{ width: `${design.mapSize.width}%` }}>
          <SurveyMap
            survey={survey}
            accent={design.accent}
            height={design.mapSize.height}
          />
        </div>
      </Draggable>
      <Draggable
        id="mapDetails"
        design={design}
        editable={editable}
        onMove={move}
        className="w-[86%]"
      >
        <div
          className="grid grid-cols-3 gap-3 rounded-xl p-4"
          style={{
            backgroundColor: design.mapDetailsStyle.fill,
            borderColor: design.mapDetailsStyle.borderColor,
            borderWidth: design.mapDetailsStyle.borderWidth,
            borderStyle: "solid",
          }}
        >
          {detailCell("owner", "Milkiilaha", survey.owner_name)}
          {detailCell("gps", "GPS", survey.gps_location)}
          {detailCell("area", "Baaxadda", survey.sketch_area)}
        </div>
      </Draggable>
    </>
  );
}
