// Shared constants used by both the server and the browser.

export const SEGMENTS = [
  { key: "Madking Studios", short: "Madking", cls: "mk", work: "films, short films, music videos, OTT series and content" },
  { key: "Space & Gravity", short: "S&G", cls: "sg", work: "ad films, brand films, documentaries, digital marketing, AI content" },
  { key: "Office", short: "Office", cls: "of", work: "shared office costs for both companies: rent, utilities, internet, supplies, staff salaries, shared tools" },
];

export const EXPENSE_CATS = [
  "Talent & Crew Remuneration", "Equipment & Rentals", "Locations & Permits", "Travel & Conveyance",
  "Food & Catering", "AI Credits & Software", "Post-production & VFX", "Art, Props & Costume",
  "Marketing & Media", "Rent", "Utilities & Internet", "Office Supplies & Maintenance",
  "Staff Salaries", "Professional Fees", "Miscellaneous",
];
export const INCOME_CATS = ["Client Payment", "Advance", "Licensing & OTT Rights", "Other Income"];
export const MODES = ["UPI", "Bank transfer", "Card", "Cash", "Cheque", "Other"];

export const PROJECT_TYPES = {
  "Madking Studios": {
    "Feature Film": ["Development", "Pre-production", "Shoot", "Post-production", "Censor & Delivery", "Released"],
    "Short Film": ["Script", "Pre-production", "Shoot", "Post-production", "Delivered", "Released"],
    "Music Video": ["Concept", "Pre-production", "Shoot", "Edit & Grade", "Delivered", "Released"],
    "OTT Series": ["Development", "Pitched", "Pre-production", "Shoot", "Post-production", "Delivered", "Streaming"],
  },
  "Space & Gravity": {
    "Ad Film": ["Brief", "Pitch", "Approved", "Pre-production", "Shoot", "Post", "Client Review", "Delivered", "Paid"],
    "Brand Film": ["Brief", "Pitch", "Approved", "Pre-production", "Shoot", "Post", "Client Review", "Delivered", "Paid"],
    "Documentary": ["Research", "Pre-production", "Shoot", "Post-production", "Review", "Delivered", "Paid"],
    "Digital Marketing": ["Brief", "Strategy", "Production", "Live", "Reporting", "Paid"],
    "AI Content": ["Brief", "Concept", "Generation", "Edit & Polish", "Client Review", "Delivered", "Paid"],
  },
};

export const EVENT_KINDS = ["Shoot", "Recce", "Meeting", "Pre-production", "Post session", "Delivery", "Deadline", "Other"];
export const PEOPLE_KINDS = ["Talent", "Crew", "Vendor"];
export const DEPARTMENTS = [
  "Direction", "Production", "Camera", "Lighting", "Grip", "Sound", "Art", "Costume", "Hair & Makeup",
  "Cast", "Editing", "VFX & AI", "Colour", "Music", "Transport", "Catering", "Equipment rental", "Other",
];

// Sheet tabs. Column order here IS the column order in Google Sheets.
export const TABS = {
  Ledger: {
    cols: ["id", "date", "type", "segment", "project", "category", "description", "party", "amount", "gstRate", "gst", "total", "mode", "status", "invoiceNo", "gstin", "file", "loggedBy", "loggedAt", "note"],
    head: ["ID", "Date", "Type", "Segment", "Project", "Category", "Description", "Paid to / Received from", "Amount (excl. GST)", "GST %", "GST", "Total", "Payment mode", "Status", "Invoice no.", "GSTIN", "Invoice file", "Logged by", "Logged at", "Original note"],
  },
  Projects: {
    cols: ["id", "name", "segment", "type", "client", "budget", "stage", "start", "end", "notes", "createdBy", "createdAt", "plan"],
    head: ["ID", "Project", "Segment", "Type", "Client", "Budget (excl. GST)", "Stage", "Start", "End", "Notes", "Created by", "Created at", "Plan / strategy"],
  },
  Schedule: {
    cols: ["id", "project", "title", "kind", "date", "endDate", "start", "end", "callTime", "location", "crew", "notes", "calendarEventId", "createdBy", "createdAt"],
    head: ["ID", "Project", "Title", "Kind", "Date", "End date", "Start", "End", "Call time", "Location", "Crew (IDs)", "Notes", "Calendar event ID", "Created by", "Created at"],
  },
  People: {
    cols: ["id", "name", "kind", "department", "role", "phone", "email", "rate", "rateUnit", "notes", "createdBy", "createdAt"],
    head: ["ID", "Name", "Kind", "Department", "Role", "Phone", "Email", "Rate (partners only)", "Rate unit", "Notes", "Added by", "Added at"],
  },
  Team: {
    cols: ["email", "name", "role", "addedBy", "addedAt"],
    head: ["Email", "Name", "Role", "Added by", "Added at"],
  },
  Daily: {
    cols: ["id", "date", "email", "name", "checkIn", "plan", "projects", "checkOut", "done", "pending", "hours", "late"],
    head: ["ID", "Date", "Email", "Name", "Checked in", "Plan for the day", "Projects", "Checked out", "Finished", "Pending", "Hours", "Late"],
  },
};

// Check-ins after this time (IST, 24h) are marked late. Override with LATE_AFTER in Vercel.
export const LATE_AFTER_DEFAULT = "10:30";

export const NUMERIC = new Set(["amount", "gstRate", "gst", "total", "budget", "rate", "hours"]);
