import { visit } from 'unist-util-visit';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escape = (s) => s.replace(/[&<>]/g, (c) => ENTITIES[c]);

export default function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid' || !parent || index == null) return;
      parent.children[index] = {
        type: 'html',
        value: `<pre class="mermaid not-content">${escape(node.value)}</pre>`,
      };
    });
  };
}
