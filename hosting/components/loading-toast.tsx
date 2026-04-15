type Props = {
  visible: boolean;
  message: string;
};

export function LoadingToast({ visible, message }: Props) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: 1000,
        maxWidth: "360px",
        padding: "12px 14px",
        borderRadius: "14px",
        border: "1px solid #93c5fd",
        background: "rgba(239, 246, 255, 0.96)",
        boxShadow: "0 12px 32px rgba(37, 99, 235, 0.18)",
        color: "#1e3a8a",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <div
          aria-hidden="true"
          style={{
            width: "14px",
            height: "14px",
            borderRadius: "999px",
            border: "2px solid #93c5fd",
            borderTopColor: "#2563eb",
            animation: "eccToastSpin 1s linear infinite",
            flex: "0 0 auto",
          }}
        />
        <div style={{ fontSize: "13px", lineHeight: 1.35, fontWeight: 600 }}>{message}</div>
      </div>
    </div>
  );
}
