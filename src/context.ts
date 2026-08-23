import type { Context as CordisContext } from "@deepseek-ai/cordis";
import type { ReactNode } from "react";

export interface TabComponentProps {
  readonly visible: boolean;
}

export interface BetterSidebarService {
  registerTab(descriptor: {
    readonly id: string;
    readonly title: string;
    readonly order?: number;
    readonly single?: boolean;
    readonly createTab?: () => { readonly tab: { readonly id: string; readonly type: string; readonly title: string } };
    readonly component: (props: TabComponentProps) => ReactNode;
  }): () => void;
}

export interface ClientContext extends CordisContext {
  readonly betterSidebar: BetterSidebarService;
}

