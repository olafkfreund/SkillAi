declare module 'rtf-parser' {
  interface RtfNode {
    value?: string
    content?: RtfNode[]
  }
  interface RtfDocument {
    content?: RtfNode[]
  }
  function string(input: string, callback: (err: Error | null, doc: RtfDocument) => void): void
  export = { string }
}
