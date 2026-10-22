"use client";
export default function PrintButton() {
  return <><button className="btn" onClick={() => history.length > 1 ? history.back() : (location.href = "/?tab=schedule")}>Back</button><button className="btn primary" onClick={() => window.print()}>Print / Save PDF</button></>;
}
