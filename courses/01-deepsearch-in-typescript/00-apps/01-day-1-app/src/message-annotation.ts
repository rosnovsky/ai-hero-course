import type { Action } from "~/action-types";

export type OurMessageAnnotation = {
  type: "NEW_ACTION";
  action: Action;
};
