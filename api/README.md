# NeuroReader API

The API exposes the same local, client-side transformation engine used by NeuroReader. It returns HTML and never sends text over the network.

## Node

```js
const NeuroReaderAPI = require("./neuroreader-api.js");
const html = NeuroReaderAPI.transform("Hello, reader!", {
  gradient: true,
  complexity: true,
  sentence: true,
  rainbowWords: true,
  progress: true,
  spotlight: true,
  motion: true,
  contrast: true,
  color: "#dc2626",
});
```

Run the included example:

```bash
node api/example.js
```

## Browser

Load `formula.min.js`, then `features.js`, then `api/neuroreader-api.js` with regular script tags. The browser global is `NeuroReaderAPI`.

```js
const html = NeuroReaderAPI.transform(text, { gradient: true });
```

## Options

- `gradient`: shade fixation letters from the selected base color.
- `complexity`: short words use the base color, medium blue, long green, and 15+ letter compounds use rainbow fixation colors.
- `sentence`: first words are green and sentence-final words are blue.
- `rainbowWords`: rotate fixation colors across words; compounds use rainbow fixation letters.
- `progress`, `spotlight`, `motion`, and `contrast`: add corresponding serializable CSS classes to the returned wrapper so the consumer can apply its own reading-aid CSS.
- `color`: six-digit base color, such as `#dc2626`.

The canonical formula is unchanged. These options decorate its returned HTML.

## Privacy and deployment

For the privacy-preserving product, call this module in the browser or in a local process. If you expose it through a server, do not log request bodies, do not persist text, use HTTPS, and apply per-IP/token rate limits at the edge. A production endpoint should enforce request size limits, timeouts, abuse detection, and quotas before invoking the module.

## License

The repository is MIT licensed. Personal and non-commercial use is free. Commercial redistribution, hosted API access, or embedding in a paid product requires a separate commercial license from the NeuroReader maintainer; contact the project owner before launch. No hosted API is provided by this repository, preserving the no-data-selling and privacy vows.
