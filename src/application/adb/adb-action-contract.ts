namespace TimeCoreDomain {
export interface AdbAction {
  id: string;
  type: string;
  name?: string;
  lead?: number | string;
  devs: string[];
  on?: boolean;
  [key: string]: unknown;
}
}
