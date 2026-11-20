const PDFExporter = {
  async exportProjectPDF(project) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 1920;
    offCanvas.height = 1080;
    const ctx = offCanvas.getContext('2d');

    const jpegPages = [];
    for (let i = 0; i < project.slides.length; i++) {
      await SlideManager.renderSlideToCanvas(ctx, project, i);
      const dataUrl = offCanvas.toDataURL('image/jpeg', 0.92);
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
      jpegPages.push(bytes);
    }

    const pdfBlob = this._buildMultiPageJpegPDF(jpegPages, 1920, 1080);
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.name || 'presentation').replace(/[^a-z0-9_\-\s]/gi, '_')}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  // Self-contained zero-dependency 16:9 multi-page PDF generator
  _buildMultiPageJpegPDF(jpegList, imgW, imgH) {
    // 16:9 page in PDF points (960 x 540 pt)
    const pageW = 960;
    const pageH = 540;
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let currentOffset = 0;

    const pushBytes = (uint8) => {
      chunks.push(uint8);
      currentOffset += uint8.length;
    };
    const pushStr = (str) => pushBytes(encoder.encode(str));

    pushStr('%PDF-1.4\n');

    const totalPages = jpegList.length;
    // Object IDs: 1 = Catalog, 2 = Pages, then per page i:
    // PageObj = 3 + i*3, ContentObj = 4 + i*3, ImageObj = 5 + i*3
    const pageKids = [];
    for (let i = 0; i < totalPages; i++) {
      pageKids.push(`${3 + i * 3} 0 R`);
    }

    // Obj 1: Catalog
    offsets[1] = currentOffset;
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Obj 2: Pages
    offsets[2] = currentOffset;
    pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageKids.join(' ')}] /Count ${totalPages} >>\nendobj\n`);

    for (let i = 0; i < totalPages; i++) {
      const pageObjId = 3 + i * 3;
      const contentObjId = 4 + i * 3;
      const imgObjId = 5 + i * 3;
      const jpegBytes = jpegList[i];

      // Page Object
      offsets[pageObjId] = currentOffset;
      pushStr(
        `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /XObject << /Im${i} ${imgObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\nendobj\n`
      );

      // Content Stream
      const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im${i} Do\nQ\n`;
      offsets[contentObjId] = currentOffset;
      pushStr(
        `${contentObjId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
      );

      // Image XObject
      offsets[imgObjId] = currentOffset;
      pushStr(
        `${imgObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
      );
      pushBytes(jpegBytes);
      pushStr('\nendstream\nendobj\n');
    }

    const xrefStart = currentOffset;
    const totalObjs = 3 + totalPages * 3;
    pushStr(`xref\n0 ${totalObjs}\n`);
    pushStr('0000000000 65535 f \n');
    for (let id = 1; id < totalObjs; id++) {
      pushStr(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    }
    pushStr(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    return new Blob(chunks, { type: 'application/pdf' });
  }
};