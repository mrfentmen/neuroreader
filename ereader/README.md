# NeuroReader e-reader integration

E-ink devices should use the static font deliverables. The browser Variable Fixation Formula is not executed on the e-reader; the font provides the fixed word-start emphasis version.

## Kindle

1. Download `fonts/NeuroReaderFont-Regular.ttf`.
2. For a personal document, embed the font during EPUB/AZW3 preparation with Calibre or Kindle Create.
3. Transfer the converted book through USB or the normal personal-document workflow.
4. In the Kindle reading settings, choose the embedded NeuroReader font when the device offers custom-font selection.
5. Confirm bold text remains readable at the selected font size and that punctuation is visible in night mode.

## Kobo

1. Copy `NeuroReaderFont-Regular.ttf` into the Kobo device's `.kobo/fonts/` directory over USB.
2. Safely eject the device and open a book.
3. Select NeuroReader from the font menu. If it does not appear, restart the Kobo and verify the file extension is `.ttf`.
4. For e-ink readability, start with the Regular or Mono variant and avoid overly tight line spacing.

## Calibre conversion

1. Open Calibre's book conversion dialog and choose EPUB or AZW3 output.
2. Add the NeuroReader font as an embedded resource in the styling/font section.
3. For a fixed transformed copy, run the local NeuroReader web app first, copy the transformed HTML, and place it into an EPUB chapter. Keep the original book as a separate copy.
4. Validate headings, links, footnotes, right-to-left text, and long words before transferring to a device.
5. Never upload copyrighted books or private documents to a conversion service; all preparation can remain local.
