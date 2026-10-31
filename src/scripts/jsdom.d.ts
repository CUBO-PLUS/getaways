declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    window: {
      document: Document;
      Node: { TEXT_NODE: number; ELEMENT_NODE: number; COMMENT_NODE: number };
      close(): void;
    };
  }
}
