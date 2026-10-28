import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
export default function DesktopTextEditor({
  value,
  onChange,
  readOnly,
  dark,
  focus,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  dark: boolean;
  focus: boolean;
}) {
  return (
    <CodeMirror
      aria-label="Text file editor"
      value={value}
      onChange={onChange}
      height="100%"
      theme={dark ? oneDark : 'light'}
      readOnly={readOnly}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
      onCreateEditor={(view) => {
        view.contentDOM.setAttribute('aria-label', 'Text file editor');
        if (focus) view.focus();
      }}
    />
  );
}
