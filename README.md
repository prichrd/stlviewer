# STLViewer

Tiny embeddable JavaScript STL viewer. No dependencies. Uses WebGL.

## Embed in a normal page

Custom element:

```html
<script src="dist/stl-viewer.js"></script>
<stl-viewer
  src="https://example.com/model.stl"
  style="width: 640px; height: 480px;"
  theme="light">
</stl-viewer>
```

JavaScript API:

```html
<div id="viewer" style="width: 640px; height: 480px;"></div>
<script src="dist/stl-viewer.js"></script>
<script>
  const viewer = new STLViewer('#viewer', {
    url: 'https://example.com/model.stl',
    theme: 'light'
  });

  viewer.setTheme('dark');
</script>
```

Mouse/touch drag rotates model. Mouse wheel zooms.

## API

```js
const viewer = new STLViewer(container, options);
await viewer.load(url);
viewer.setTheme('dark');
viewer.setTheme('light');
viewer.clear();
viewer.dispose();
```

`container` can be DOM element or selector.

Options:

- `url`: STL URL to load. Binary and ASCII STL supported.
- `theme`: `light` or `dark`, default `light`.
- `background`: CSS hex color. Overrides theme background.
- `color`: RGB array from `0` to `1` or CSS hex color. Overrides theme color.
- `autoResize`: resize with container, default `true`.

Custom element also supports runtime toggles:

```js
const viewer = document.querySelector('stl-viewer');
viewer.setAttribute('theme', 'dark');
viewer.setAttribute('theme', 'light');
```

Note: remote STL URLs need CORS headers if hosted on another domain.
