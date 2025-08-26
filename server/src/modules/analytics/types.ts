export const AnalyticsEventTypes = [
  "SESSION_START",
  "SESSION_END",
  "PAGE_VIEW",
  "FEATURE_USED",
  "EXPORT",
  "LOGIN",
  "LOGOUT",
] as const;

export type AnalyticsEventType = (typeof AnalyticsEventTypes)[number];

export const FeatureKeys = [
  "ANALYTICS_VIEW",
  "REVENUE_VIEW",
  "EXPORT_CSV",
  "EXPORT_PDF",
  "BOARD_CREATE",
  "LIST_CREATE",
  "CARD_CREATE",
  "CARD_MOVE",
  "COMMENT_ADD",
  "ATTACHMENT_UPLOAD",
  "LABEL_ADD",
  "SETTINGS_UPDATE",
  "USER_MANAGEMENT",
] as const;

export type FeatureKey = (typeof FeatureKeys)[number];
