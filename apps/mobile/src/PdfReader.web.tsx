import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, s } from "./ui";

interface PdfReaderProps {
  url: string;
  token: string;
  pageCount: number;
}
export default function PdfReader({ url, token, pageCount }: PdfReaderProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [baseSrc, setBaseSrc] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let blobUrl: string | null = null;
    setError("");
    // An <iframe> navigation can never carry the Authorization header, so a
    // token-protected content URL is fetched once with the token and
    // re-surfaced as a blob URL; provider (pre-signed) URLs load directly.
    if (/\/api\/files\/[^/]+\/content/.test(url)) {
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Request failed (${response.status})`);
          const blob = await response.blob();
          blobUrl = URL.createObjectURL(blob);
          if (!cancelled) setBaseSrc(blobUrl);
        })
        .catch((cause) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
        });
      return () => {
        cancelled = true;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      };
    }
    setBaseSrc(url);
    return () => {
      cancelled = true;
    };
  }, [url, token]);
  const src = baseSrc ? `${baseSrc}#page=${page}&zoom=${zoom}` : undefined;
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.between, { gap: 8, flexWrap: "wrap" }]}>
        <View style={[s.row, { gap: 8 }]}>
          <Button small icon={ChevronLeft} disabled={page <= 1} onPress={() => setPage(page - 1)}>
            Previous
          </Button>
          <Text style={s.small}>
            {page} / {pageCount}
          </Text>
          <Button
            small
            icon={ChevronRight}
            disabled={page >= pageCount}
            onPress={() => setPage(page + 1)}
          >
            Next
          </Button>
        </View>
        <View style={[s.row, { gap: 8 }]}>
          <Button small icon={Minus} disabled={zoom <= 50} onPress={() => setZoom(zoom - 25)}>
            Zoom out
          </Button>
          <Text style={s.small}>{zoom}%</Text>
          <Button small icon={Plus} disabled={zoom >= 200} onPress={() => setZoom(zoom + 25)}>
            Zoom in
          </Button>
        </View>
      </View>
      {error ? <Text style={s.small}>{error}</Text> : null}
      {src ? (
        <iframe
          key={src}
          title="PDF document reader"
          src={src}
          style={{ height: 570, width: "100%", border: 0, borderRadius: 12, background: "#e7e9e3" }}
        />
      ) : null}
      <Text style={s.small}>Use the reader toolbar to download or print a copy.</Text>
    </View>
  );
}
