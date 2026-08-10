# STLViewer

Tiny embeddable JavaScript STL viewer. No dependencies. Uses WebGL.

## Embed in a normal page

Custom element:

```html
<script src="dist/stl-viewer.js"></script>
<stl-viewer
  src="https://example.com/model.stl"
  style="width: 640px; height: 480px;"
  background="#ffffff"
  color="0.8,0.82,0.86">
</stl-viewer>
```

JavaScript API:

```html
<div id="viewer" style="width: 640px; height: 480px;"></div>
<script src="dist/stl-viewer.js"></script>
<script>
  const viewer = new STLViewer('#viewer', {
    url: 'https://example.com/model.stl',
    background: '#ffffff',
    color: [0.8, 0.82, 0.86]
  });
</script>
```

Mouse/touch drag rotates model. Mouse wheel zooms.

## API

```js
const viewer = new STLViewer(container, options);
await viewer.load(url);
viewer.dispose();
```

`container` can be DOM element or selector.

Options:

- `url`: STL URL to load. Binary and ASCII STL supported.
- `background`: CSS hex color, default `#ffffff`.
- `color`: RGB array from `0` to `1`, default `[0.8, 0.82, 0.86]`.
- `autoResize`: resize with container, default `true`.

Note: remote STL URLs need CORS headers if hosted on another domain.
