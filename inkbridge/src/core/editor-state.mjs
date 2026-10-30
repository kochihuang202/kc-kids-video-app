// Lexical's SerializedEditorState is a JSON representation, but optional JS
// properties can be undefined. Match its documented JSON export semantics.
export function serializeEditorState(editorState){
  return JSON.parse(JSON.stringify(editorState.toJSON()));
}
