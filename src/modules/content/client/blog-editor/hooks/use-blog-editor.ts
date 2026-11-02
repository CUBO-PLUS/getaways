import { useBlogPersistence } from "./use-blog-persistence";
import { useEditorTools } from "./use-editor-tools";
import type { Draft } from "../shared";

export function useBlogEditor(id: string) {
  const tools = useEditorTools({ id, markDirty, field, setError });
  const persistence = useBlogPersistence({ id, editor: tools.editor, setReady: tools.setReady });

  // Editor callbacks run after both hooks have initialized.
  function markDirty() {
    persistence.markDirty();
  }

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    persistence.field(key, value);
  }

  function setError(message: string) {
    persistence.setError(message);
  }

  function showPreview() {
    if (persistence.dirtyRef.current || persistence.inFlight.current || persistence.conflictRef.current || tools.uploading) {
      setError("Guarda los cambios y espera a que termine la subida antes de abrir la vista previa.");
      return;
    }
    tools.showPreview();
  }

  return { persistence, tools, showPreview };
}
