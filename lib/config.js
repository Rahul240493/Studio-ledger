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
  "Staff Salaries", "Professional Fees", "GST & Taxes", "Miscellaneous",
];
// Tax paid to the government (GST returns etc.): counted as GST paid, not as an expense.
export const TAX_CAT = "GST & Taxes";
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
    cols: ["id", "name", "segment", "type", "client", "budget", "stage", "start", "end", "notes", "createdBy", "createdAt", "plan",
      "pipeline", "engagement", "industry", "reels", "statics", "otherScope", "objective", "audience", "brand", "platforms", "links", "clientPoc", "teamPocs", "color"],
    head: ["ID", "Project", "Segment", "Type", "Client", "Budget (excl. GST)", "Stage", "Start", "End", "Notes", "Created by", "Created at", "Plan / strategy",
      "Pipeline", "Engagement", "Industry", "Reels (per month for retainers)", "Statics (per month for retainers)", "Other deliverables", "Objective", "Audience", "Brand voice", "Platforms", "Key links", "Client POC", "Team POCs (emails)", "Colour"],
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
    cols: ["email", "name", "role", "addedBy", "addedAt", "title", "group"],
    head: ["Email", "Name", "Access", "Added by", "Added at", "Job title", "Group"],
  },
  Daily: {
    cols: ["id", "date", "email", "name", "checkIn", "plan", "projects", "checkOut", "done", "pending", "hours", "late"],
    head: ["ID", "Date", "Email", "Name", "Checked in", "Plan for the day", "Projects", "Checked out", "Finished", "Pending", "Hours", "Late"],
  },
};

Object.assign(TABS, {
  Tickets: {
    cols: ["id", "projectId", "title", "priority", "status", "kind", "pocs", "deadline", "notes", "createdBy", "createdAt", "doneAt"],
    head: ["ID", "Project ID", "Ticket", "Priority", "Status", "Type", "POCs (emails)", "Deadline", "Notes", "Created by", "Created at", "Done at"],
  },
  Content: {
    cols: ["id", "projectId", "date", "format", "platform", "title", "status", "owners", "link", "notes", "createdBy", "createdAt", "postedAt"],
    head: ["ID", "Project ID", "Post date", "Format", "Platform", "Title", "Status", "Owners (emails)", "Link", "Notes", "Created by", "Created at", "Posted on"],
  },
  Updates: {
    cols: ["id", "projectId", "date", "text", "by", "at"],
    head: ["ID", "Project ID", "Date", "Update", "By", "Posted at"],
  },
});

/* ---------- work tracker (from the Space & Gravity tracker) ---------- */
export const PIPELINE = ["Lead", "Discovery done", "Pitched", "Closing", "Onboarding", "Active", "On hold", "Delivered", "Lost"];
export const PIPE_ORDER = ["Active", "Onboarding", "Closing", "Pitched", "Discovery done", "Lead", "On hold", "Delivered", "Lost"];
export const EARLY = ["Lead", "Discovery done", "Pitched", "Closing"];
export const RING_OF = { Active: 1, Onboarding: 2, Closing: 2, Pitched: 3, "Discovery done": 3, Lead: 3, "On hold": 4 };
export const RING_LABEL = ["", "Active", "Onboarding and closing", "Pitched and discovery", "On hold"];
export const ENGAGEMENTS = ["Retainer", "One-time", "Recurring one-time"];
export const INDUSTRIES = ["Sports", "Real estate", "Fashion", "Skin care", "F&B", "Film and music", "Media", "Events", "Government", "Healthcare", "Other"];
export const PRIORITIES = [["P1", "P1 High"], ["P2", "P2 Medium"], ["P3", "P3 Low"]];
export const PR_RANK = { P1: 0, P2: 1, P3: 2 };
export const T_STATUS = ["To do", "In progress", "In review", "Blocked", "Done"];
export const T_KIND = ["Internal", "Client deliverable"];
export const C_FORMATS = ["Reel", "Static", "Carousel", "Story", "Video", "Photos"];
export const C_GLYPH = { Reel: "R", Static: "S", Carousel: "C", Story: "St", Video: "V", Photos: "P" };
export const C_STATUS = ["Idea", "Scripting", "Shoot", "Edit", "Client review", "Approved", "Scheduled", "Delayed", "Posted"];
export const PLATFORMS = ["Instagram", "YouTube", "LinkedIn", "Facebook", "X"];
export const GROUPS = ["Leadership", "Partners", "Creative and production", "Live shoot"];
export const PALETTE = ["#82A6FF", "#F28C6B", "#6FD8B4", "#C3A0FF", "#F3C46A", "#6BCBF2", "#FF9EC4", "#B9C86B", "#F2A65A", "#9DB4D8", "#E58FE0", "#7ED3D1", "#D7B98E"];
export const ONE_TIME_TPL = [
  ["Brief and scope sign-off", "Client deliverable", "P1", 0],
  ["Pre-production: script, shot list, schedule", "Internal", "P1", 3],
  ["Shoot", "Internal", "P1", 7],
  ["First cut", "Internal", "P2", 12],
  ["Client review and feedback", "Client deliverable", "P2", 14],
  ["Final delivery", "Client deliverable", "P1", 18],
  ["Invoice and close-out", "Internal", "P3", 21],
];
export const LEAD_TPL = [
  ["Discovery call notes and requirements", "Internal", "P2", 0],
  ["Proposal and quote", "Client deliverable", "P1", 3],
  ["Follow up on proposal", "Client deliverable", "P2", 7],
];

// Check-ins after this time (IST, 24h) are marked late. Override with LATE_AFTER in Vercel.
export const LATE_AFTER_DEFAULT = "10:30";

export const NUMERIC = new Set(["amount", "gstRate", "gst", "total", "budget", "rate", "hours", "reels", "statics"]);
