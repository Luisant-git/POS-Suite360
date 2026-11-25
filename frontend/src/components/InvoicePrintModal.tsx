import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Loader2, QrCode, Download, X } from 'lucide-react';

const numberToWords = (num: number, isIndian: boolean = true): string => {
  const value = Math.abs(Number(num) || 0);
  if (value === 0) return isIndian ? 'RUPEES ZERO ONLY' : 'ZERO ONLY';

  const a = ['', 'ONE ', 'TWO ', 'THREE ', 'FOUR ', 'FIVE ', 'SIX ', 'SEVEN ', 'EIGHT ', 'NINE ', 'TEN ', 'ELEVEN ', 'TWELVE ', 'THIRTEEN ', 'FOURTEEN ', 'FIFTEEN ', 'SIXTEEN ', 'SEVENTEEN ', 'EIGHTEEN ', 'NINETEEN '];
  const b = ['', '', 'TWENTY ', 'THIRTY ', 'FORTY ', 'FIFTY ', 'SIXTY ', 'SEVENTY ', 'EIGHTY ', 'NINETY '];

  const convertTwoDigits = (n: number): string => {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? a[n % 10] : '');
  };

  const convertThreeDigits = (n: number): string => {
    if (n < 100) return convertTwoDigits(n);
    return a[Math.floor(n / 100)] + 'HUNDRED ' + (n % 100 ? convertTwoDigits(n % 100) : '');
  };

  const convertIndian = (n: number): string => {
    if (n === 0) return '';
    let out = '';
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (crore > 0) out += convertIndian(crore) + 'CRORE ';
    if (lakh > 0) out += convertTwoDigits(lakh) + 'LAKH ';
    if (thousand > 0) out += convertTwoDigits(thousand) + 'THOUSAND ';
    if (n > 0) out += convertThreeDigits(n);
    return out.trim();
  };

  const convertWestern = (n: number): string => {
    if (n === 0) return '';
    let out = '';
    const million = Math.floor(n / 1000000);
    n %= 1000000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (million > 0) out += convertThreeDigits(million) + 'MILLION ';
    if (thousand > 0) out += convertThreeDigits(thousand) + 'THOUSAND ';
    if (n > 0) out += convertThreeDigits(n);
    return out.trim();
  };

  let whole = Math.floor(value);
  let fractional = Math.round((value - whole) * 100);
  if (fractional >= 100) {
    whole += 1;
    fractional = 0;
  }

  const wholeWords = whole > 0
    ? (isIndian ? convertIndian(whole) : convertWestern(whole))
    : 'ZERO';
  const fracWords = fractional > 0
    ? (isIndian ? convertTwoDigits(fractional).trim() : convertTwoDigits(fractional).trim())
    : '';

  if (isIndian) {
    return fracWords
      ? `RUPEES ${wholeWords} AND ${fracWords} PAISA ONLY`
      : `RUPEES ${wholeWords} ONLY`;
  }
  return fracWords
    ? `${wholeWords} AND CENTS ${fracWords} ONLY`
    : `${wholeWords} ONLY`;
};

const parseStateAndCode = (stateStr?: string | null, gstin?: string | null) => {
  const raw = (stateStr || '').trim();
  const gst = (gstin || '').trim();
  const gstPrefix = /^\d{2}/.test(gst) ? gst.slice(0, 2) : '';

  const match = raw.match(/^(\d{1,2})\s*[-–:]\s*(.+)$/);
  if (match) {
    return { code: match[1].padStart(2, '0'), name: match[2].trim() };
  }
  if (/^\d{1,2}$/.test(raw)) {
    return { code: raw.padStart(2, '0'), name: '' };
  }
  return { code: gstPrefix, name: raw };
};

const formatDisplayDate = (dateInput?: string | Date | null): string => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};
import { useSettings } from '../contexts/SettingsContext';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { QRCodeCanvas } from 'qrcode.react';
import toast from 'react-hot-toast';

interface InvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: any;
  hiddenRenderer?: boolean;
  isEstimation?: boolean;
  autoPrint?: boolean;
  forceFormat?: 'a4' | 'a5' | 'thermal';
}

const InvoicePrintModal = ({ isOpen, onClose, sale: initialSale, hiddenRenderer = false, isEstimation = false, autoPrint = false, forceFormat }: InvoicePrintModalProps) => {
  const { settings } = useSettings();
  const [isSharing, setIsSharing] = useState(false);
  const [isSharingQR, setIsSharingQR] = useState(false);
  const [isDownloadingQR, setIsDownloadingQR] = useState(false);
  const [printFormat, setPrintFormat] = useState<'a4' | 'a5' | 'thermal'>(
    () => {
      const saved = (localStorage.getItem('invoicePrintFormat') || 'a4').toLowerCase();
      return (saved === 'a5' || saved === 'thermal') ? saved as 'a5' | 'thermal' : 'a4';
    }
  );

  // Sync from settings when loaded (forceFormat takes priority, then settings.printFormat)
  useEffect(() => {
    if (forceFormat) {
      setPrintFormat(forceFormat);
      return;
    }
    if (settings?.printFormat) {
      const fmt = settings.printFormat.toLowerCase() as 'a4' | 'a5' | 'thermal';
      if (fmt === 'a4' || fmt === 'a5' || fmt === 'thermal') {
        setPrintFormat(fmt);
        localStorage.setItem('invoicePrintFormat', fmt);
      }
    }
  }, [forceFormat, settings?.printFormat]);

  // Always fetch full sale data to ensure unit, paymentMode, customer are fully populated
  const { data: fullSale, isLoading } = useQuery({
    queryKey: [isEstimation ? 'estimation-print' : 'invoice-print', initialSale?.id],
    queryFn: async () => (await api.get(`/${isEstimation ? 'estimations' : 'sales'}/${initialSale.id}`)).data,
    enabled: isOpen && !!initialSale?.id,
    staleTime: 0,
    gcTime: 0,
  });

  const sale = fullSale || initialSale;
  const invoiceNo = sale?.estimationNo || sale?.invoiceNo || '';
  const showPaymentInfo = !isEstimation || (sale?.stockMaintained ?? settings?.estimationStockMaintain);
  const activeUpiId = isEstimation
    ? settings?.estimationUpiId
    : settings?.upiId;

  useEffect(() => {
    if (autoPrint && !isLoading && sale) {
      const timer = setTimeout(() => {
        window.print();
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, isLoading, sale, onClose]);

  useEffect(() => {
    if (isOpen && invoiceNo) {
      const originalTitle = document.title;
      document.title = `invoice_${invoiceNo}`;
      return () => {
        document.title = originalTitle;
      };
    }
  }, [isOpen, invoiceNo]);

  if (!isOpen) return null;

  if (isLoading && !hiddenRenderer) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-white p-6 rounded-md shadow-lg font-bold text-blue-900 flex items-center gap-3">
          <Loader2 className="animate-spin" size={20} /> Loading invoice data...
        </div>
      </div>
    );
  }

  const date = formatDisplayDate(sale?.date);
  const customerName = sale?.customer?.name || 'CASH A/C';
  const items = sale?.items || [];
  const grandTotal = Number(sale?.grandTotal || 0);
  const currency = settings?.currencySymbol || 'RM';
  const isIndianCurrency =
    currency.includes('₹') ||
    currency.toUpperCase().includes('RS') ||
    currency.toUpperCase().includes('INR') ||
    (settings?.country || '').trim().toLowerCase() === 'india';

  const storeStateInfo = parseStateAndCode(settings?.state, settings?.gstin);
  const custStateInfo = parseStateAndCode(sale?.customer?.state, sale?.customer?.gstNumber);
  const isIntraState = Boolean(
    (storeStateInfo.code && custStateInfo.code && storeStateInfo.code === custStateInfo.code) ||
    (storeStateInfo.name && custStateInfo.name && storeStateInfo.name.toLowerCase() === custStateInfo.name.toLowerCase())
  );

  const sellerPan =
    (settings?.panNo || '').trim().toUpperCase() ||
    (settings?.gstin && settings.gstin.trim().length >= 12 ? settings.gstin.trim().slice(2, 12).toUpperCase() : '');

  const subtotalVal = Number(sale?.subtotal || 0);
  const discountVal = Number(sale?.discount || 0);
  const taxableTotalVal = Math.max(0, subtotalVal - discountVal);
  const totalTaxVal = Number(sale?.tax || 0);
  const freightVal = Number(sale?.freightCharges || 0);
  const explicitRoundOff = sale?.roundOff !== undefined && sale?.roundOff !== null ? Number(sale.roundOff) : 0;
  const roundOffVal = Math.abs(explicitRoundOff) >= 0.005
    ? explicitRoundOff
    : Number((grandTotal - (subtotalVal - discountVal + totalTaxVal + freightVal)).toFixed(2));
  const hasRoundOff = Math.abs(roundOffVal) >= 0.005;

  const showTaxColumns = !isEstimation && (Boolean(settings?.enableTax) || totalTaxVal > 0 || items.some((it: any) => Number(it.tax || 0) > 0 || Number(it.product?.taxPercent || 0) > 0));
  const showMrpColumn = !isEstimation && items.some((it: any) => !it.isService);

  const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
  const itemsAmountSum = items.reduce((sum: number, it: any) => sum + Number(it.amount || it.total || 0), 0);
  const amountIsPreTax = Math.abs(subtotalVal - itemsAmountSum) < 0.05 && totalTaxVal > 0;

  const cgstTotal = isIntraState ? totalTaxVal / 2 : 0;
  const sgstTotal = isIntraState ? totalTaxVal / 2 : 0;
  const igstTotal = isIntraState ? 0 : totalTaxVal;

  // Build GST Rate-wise breakdown for the Tax Summary table
  const taxBreakdownMap = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  if (showTaxColumns) {
    items.forEach((it: any) => {
      const itemAmt = Number(it.amount || it.total || 0);
      const itemTax = Number(it.tax || 0);
      const itemTaxable = amountIsPreTax ? itemAmt : Math.max(0, itemAmt - itemTax);
      let gstRate = Number(!it.isService ? it.product?.taxPercent : it.serviceItem?.taxPercent) || 0;
      if (gstRate === 0 && itemTax > 0 && itemTaxable > 0) {
        gstRate = Math.round((itemTax / itemTaxable) * 10000) / 100;
      }
      const existing = taxBreakdownMap.get(gstRate) || { rate: gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      existing.taxable += itemTaxable;
      const effectiveTax = itemTax > 0 ? itemTax : (itemTaxable * gstRate) / 100;
      if (isIntraState) {
        existing.cgst += effectiveTax / 2;
        existing.sgst += effectiveTax / 2;
      } else {
        existing.igst += effectiveTax;
      }
      taxBreakdownMap.set(gstRate, existing);
    });
  }
  const taxBreakdownRows = Array.from(taxBreakdownMap.values()).sort((a, b) => a.rate - b.rate);
  const hasBankDetails = Boolean(settings?.bankName || settings?.bankAccountNo || settings?.bankBranchIfsc);

  const handleWhatsApp = async () => {
    setIsSharing(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const W = 210;
      const margin = 14;
      let y = margin;
      const col = margin;
      const lineH = 6;

      const addText = (t: string | string[], x: number, yPos: number, opts: any = {}) => {
        doc.setFontSize(opts.size || 10);
        doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
        doc.setTextColor(opts.color || '#1e293b');
        const textOpts: any = {};
        if (opts.maxWidth) textOpts.maxWidth = opts.maxWidth;
        if (opts.align) textOpts.align = opts.align;
        doc.text(t || '', x, yPos, textOpts);
      };

      // Logo
      if (settings?.logoImage) {
        try {
          const logoImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image(); img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img); img.onerror = reject; img.src = settings.logoImage!;
          });
          const maxW = 50, maxH = 20;
          const ratio = Math.min(maxW / (logoImg.width || 100), maxH / (logoImg.height || 40));
          const lw = (logoImg.width || 100) * ratio, lh = (logoImg.height || 40) * ratio;
          const cv = document.createElement('canvas'); cv.width = logoImg.width; cv.height = logoImg.height;
          cv.getContext('2d')!.drawImage(logoImg, 0, 0);
          doc.addImage(cv.toDataURL('image/png'), 'PNG', col, y, lw, lh);
          y += lh + 4;
        } catch { /* skip */ }
      }

      addText((settings?.shopName || 'POS Suite 360').toUpperCase(), col, y, { size: 14, bold: true, color: '#04325E' }); y += 7;
      if (settings?.invoiceTitle) { addText(settings.invoiceTitle, col, y, { size: 10, color: '#1A63A8' }); y += 5; }
      if (settings?.shopAddress) { addText(settings.shopAddress, col, y, { size: 9, color: '#475569' }); y += 5; }
      const cityLine = [settings?.city, settings?.state, settings?.country].filter(Boolean).join(', ');
      if (cityLine) { addText(cityLine, col, y, { size: 9, bold: true, color: '#475569' }); y += 5; }
      if (settings?.phone) { addText(`Tel: ${settings.phone}`, col, y, { size: 9, color: '#475569' }); y += 5; }
      if (settings?.gstin) { addText(`GSTIN: ${settings.gstin}`, col, y, { size: 9, color: '#475569' }); y += 5; }

      // Invoice label top-right
      addText(isEstimation ? 'BILL' : 'TAX INVOICE', W - margin, margin + 4, { size: 16, bold: true, color: '#1A63A8', align: 'right' });
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor('#334155');
      doc.text(`${isEstimation ? 'Est No' : 'Invoice No'}: #${invoiceNo}`, W - margin, margin + 11, { align: 'right' });

      y += 4;
      doc.setDrawColor('#e2e8f0'); doc.setLineWidth(0.3); doc.line(col, y, W - margin, y); y += 6;

      // Bill To (left column)
      const billStartY = y;
      addText('BUYER / BILLED TO', col, y, { size: 8, bold: true, color: '#64748b' }); y += 5;
      addText(customerName, col, y, { size: 11, bold: true }); y += 5;
      if (sale?.customer?.address) {
        const addressLines = doc.splitTextToSize(sale.customer.address, 84);
        addText(addressLines, col, y, { size: 9, color: '#475569' }); y += (addressLines.length * 4) + 1;
      }
      if (custStateInfo.name || custStateInfo.code) {
        const stateText = [
          custStateInfo.name,
          custStateInfo.code ? `State Code: ${custStateInfo.code}` : ''
        ].filter(Boolean).join('   ');
        addText(stateText, col, y, { size: 9, color: '#475569' }); y += 5;
      }
      if (sale?.customer?.phone) { addText(`Phone: ${sale.customer.phone}`, col, y, { size: 9, color: '#475569' }); y += 5; }
      if (sale?.customer?.gstNumber) { addText(`GSTIN: ${sale.customer.gstNumber}`, col, y, { size: 9, bold: true, color: '#334155' }); y += 5; }
      const buyerBottomY = y;

      // Invoice/Estimation details — right column, aligned with Bill To
      const midX = W / 2 + 4;
      const lx = midX, vx = W - margin;
      let iy = billStartY;
      addText(isEstimation ? 'ESTIMATION DETAILS' : 'INVOICE DETAILS', midX, iy, { size: 8, bold: true, color: '#64748b' }); iy += 5;
      doc.setFontSize(9); doc.setTextColor('#334155');
      const detailRows: [string, string][] = [
        [isEstimation ? 'Est No:' : 'Invoice No:', `#${invoiceNo}`],
        ['Invoice Date:', date],
        ...(sellerPan ? [['PAN No:', sellerPan] as [string, string]] : []),
        ['Payment:', sale?.paymentMode?.name || 'Cash'],
      ];
      if (Number(sale?.customer?.openingBalance) > 0) {
        detailRows.push(['Pending:', `${currency.replace('\u20b9', 'Rs.')} ${Number(sale.customer.openingBalance).toFixed(2)}`]);
      }
      detailRows.forEach(([label, val]) => {
        doc.setFont('helvetica', 'bold'); doc.text(label, lx, iy);
        doc.setFont('helvetica', 'normal'); doc.text(val, vx, iy, { align: 'right' }); iy += 5;
      });

      y = Math.max(buyerBottomY, iy) + 3;
      doc.setDrawColor('#e2e8f0'); doc.line(col, y, W - margin, y); y += 5;

      // Table header
      const pdfCurr = currency.replace('\u20b9', 'Rs.');
      doc.setFillColor('#2D6AA1'); doc.rect(col, y - 4, W - margin * 2, 8, 'F');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#ffffff');
      doc.text('S.No', col + 2, y + 1);
      doc.text('DESCRIPTION OF GOODS', col + 12, y + 1);
      doc.text('HSN', col + 80, y + 1, { align: 'center' });
      if (showTaxColumns) doc.text('GST %', col + 98, y + 1, { align: 'center' });
      doc.text('QTY', col + 118, y + 1, { align: 'center' });
      doc.text('RATE', col + 140, y + 1, { align: 'right' });
      if (showMrpColumn) doc.text('MRP', col + 158, y + 1, { align: 'right' });
      doc.text(`AMT (${pdfCurr})`, W - margin - 2, y + 1, { align: 'right' });
      y += 7;

      // Table rows
      items.forEach((item: any, idx: number) => {
        if (y > 255) {
          doc.addPage();
          y = margin + 6;
        }
        const displayName = item.isService
          ? (item.itemName || item.serviceItem?.name || '')
          : `${item.product?.name || ''}${item.product?.code ? ` (${item.product.code})` : ''}`;
        const splitName = doc.splitTextToSize(displayName, 62);
        const rowH = Math.max(lineH + 1, splitName.length * 4 + 2);
        if (idx % 2 === 0) { doc.setFillColor('#f8fafc'); doc.rect(col, y - 4, W - margin * 2, rowH, 'F'); }

        const itemAmt = Number(item.amount || item.total || 0);
        const itemTax = Number(item.tax || 0);
        const itemTaxable = amountIsPreTax ? itemAmt : Math.max(0, itemAmt - itemTax);
        let gstRate = Number(!item.isService ? item.product?.taxPercent : item.serviceItem?.taxPercent) || 0;
        if (gstRate === 0 && itemTax > 0 && itemTaxable > 0) gstRate = Math.round((itemTax / itemTaxable) * 100);
        const mrpVal = Number(!item.isService ? item.product?.mrp : 0) || 0;

        doc.setFontSize(8); doc.setTextColor('#1e293b');
        doc.setFont('helvetica', 'normal'); doc.text(String(idx + 1), col + 4, y, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.text(splitName, col + 12, y);
        doc.setFont('helvetica', 'normal');
        doc.text(!item.isService && item.product?.hsnCode ? String(item.product.hsnCode) : '-', col + 80, y, { align: 'center' });
        if (showTaxColumns) doc.text(`${gstRate}%`, col + 98, y, { align: 'center' });
        doc.text(`${Number(item.quantity || 0)} ${item.isService ? 'Svc' : (item.product?.unit?.shortCode || 'Nos')}`, col + 118, y, { align: 'center' });
        doc.text(Number(item.rate || 0).toFixed(2), col + 140, y, { align: 'right' });
        if (showMrpColumn) doc.text(mrpVal > 0 ? mrpVal.toFixed(2) : '-', col + 158, y, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(itemAmt.toFixed(2), W - margin - 2, y, { align: 'right' });
        y += rowH;
      });

      // Table Total Row (Total Qty + Total Amount)
      doc.setFillColor('#F0F5FA'); doc.rect(col, y - 3.5, W - margin * 2, 7, 'F');
      doc.setDrawColor('#1A63A8'); doc.setLineWidth(0.3);
      doc.line(col, y - 3.5, W - margin, y - 3.5);
      doc.line(col, y + 3.5, W - margin, y + 3.5);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#04325E');
      doc.text('Total', col + 12, y + 1);
      doc.text(Number(totalQty).toFixed(2), col + 118, y + 1, { align: 'center' });
      doc.text(`${pdfCurr} ${itemsAmountSum.toFixed(2)}`, W - margin - 2, y + 1, { align: 'right' });
      y += 9;

      if (y > 215) {
        doc.addPage();
        y = margin + 4;
      }

      // Totals Summary (right side) & Bank / Terms (left side)
      const totalsX = W - margin - 64;
      const valX = W - margin - 2;
      let ty = y;

      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor('#334155');
      doc.text('Amount:', totalsX, ty); doc.text(subtotalVal.toFixed(2), valX, ty, { align: 'right' }); ty += 5;
      if (discountVal > 0) {
        doc.text('Discount:', totalsX, ty); doc.text(`-${discountVal.toFixed(2)}`, valX, ty, { align: 'right' }); ty += 5;
        doc.setFont('helvetica', 'bold');
        doc.text('Taxable Total:', totalsX, ty); doc.text(taxableTotalVal.toFixed(2), valX, ty, { align: 'right' }); ty += 5;
        doc.setFont('helvetica', 'normal');
      }
      if (showTaxColumns && totalTaxVal > 0) {
        doc.text('Sales CGST:', totalsX, ty); doc.text(cgstTotal.toFixed(2), valX, ty, { align: 'right' }); ty += 5;
        doc.text('Sales SGST:', totalsX, ty); doc.text(sgstTotal.toFixed(2), valX, ty, { align: 'right' }); ty += 5;
        doc.text('Sales IGST:', totalsX, ty); doc.text(igstTotal.toFixed(2), valX, ty, { align: 'right' }); ty += 5;
      }
      if (freightVal > 0) {
        doc.text('Freight Charges (+):', totalsX, ty); doc.text(freightVal.toFixed(2), valX, ty, { align: 'right' }); ty += 5;
      }
      if (hasRoundOff) {
        doc.text('Round Off:', totalsX, ty);
        doc.text(`${roundOffVal > 0 ? '+' : ''}${roundOffVal.toFixed(2)}`, valX, ty, { align: 'right' });
        ty += 5;
      }

      // Total due highlight box
      doc.setFillColor('#F0F5FA'); doc.rect(totalsX - 3, ty - 3.5, W - margin - totalsX + 3, 9.5, 'F');
      doc.setDrawColor('#1A63A8'); doc.setLineWidth(0.45);
      doc.line(totalsX - 3, ty - 3.5, W - margin, ty - 3.5);
      doc.line(totalsX - 3, ty + 6, W - margin, ty + 6);
      doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#04325E');
      doc.text('Total Due:', totalsX, ty + 2.5);
      doc.text(`${pdfCurr} ${grandTotal.toFixed(2)}`, valX, ty + 2.5, { align: 'right' });
      ty += 11;

      // Bank Details & Terms on left column beside totals
      let ly = y;
      if (hasBankDetails) {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor('#1A63A8');
        doc.text("COMPANY'S BANK DETAILS", col, ly); ly += 4.5;
        doc.setFontSize(7.5); doc.setTextColor('#1e293b');
        if (settings?.bankName) {
          doc.setFont('helvetica', 'bold'); doc.text('Bank Name: ', col, ly);
          doc.setFont('helvetica', 'normal'); doc.text(settings.bankName, col + 26, ly); ly += 4;
        }
        if (settings?.bankAccountNo) {
          doc.setFont('helvetica', 'bold'); doc.text('Account No: ', col, ly);
          doc.setFont('helvetica', 'normal'); doc.text(settings.bankAccountNo, col + 26, ly); ly += 4;
        }
        if (settings?.bankBranchIfsc) {
          doc.setFont('helvetica', 'bold'); doc.text('Branch & IFSC: ', col, ly);
          doc.setFont('helvetica', 'normal'); doc.text(settings.bankBranchIfsc, col + 26, ly); ly += 4;
        }
        ly += 3;
      }

      const rawNotes = (settings?.invoiceNotes ?? '1. Goods once sold cannot be taken back or exchanged.<br/>2. Subject to Salem jurisdiction.');
      if (rawNotes) {
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor('#1A63A8');
        doc.text('TERMS & CONDITIONS', col, ly); ly += 4.5;
        const cleanNotes = rawNotes
          .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n')
          .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
          .replace(/(\d+\.)/g, '\n$1').replace(/\n\s*\n/g, '\n').trim();
        const splitNotes = doc.splitTextToSize(cleanNotes, totalsX - col - 8);
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor('#334155');
        doc.text(splitNotes, col, ly);
        ly += splitNotes.length * 3.5 + 3;
      }

      y = Math.max(ty, ly) + 2;

      // Amount Chargeable in words + E. & O.E
      doc.setFillColor('#F8FAFC'); doc.rect(col, y - 3.5, W - margin * 2, 10, 'F');
      doc.setDrawColor('#E2E8F0'); doc.setLineWidth(0.3); doc.rect(col, y - 3.5, W - margin * 2, 10);
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor('#64748B');
      doc.text('Amount Chargeable (in words):', col + 2, y);
      doc.text('E. & O.E', W - margin - 2, y, { align: 'right' });
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor('#04325E');
      doc.text(numberToWords(grandTotal, isIndianCurrency), col + 2, y + 4.5, { maxWidth: W - margin * 2 - 4 });
      y += 12;

      // GST Breakdown Table
      if (showTaxColumns && taxBreakdownRows.length > 0) {
        if (y > 240) { doc.addPage(); y = margin + 4; }
        doc.setFillColor('#2D6AA1'); doc.rect(col, y - 3.5, W - margin * 2, 7, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor('#ffffff');
        doc.text('GST RATE', col + 2, y + 1);
        doc.text('TAXABLE VALUE', col + 50, y + 1, { align: 'right' });
        doc.text('CGST %', col + 68, y + 1, { align: 'center' });
        doc.text('CGST AMT', col + 94, y + 1, { align: 'right' });
        doc.text('SGST %', col + 112, y + 1, { align: 'center' });
        doc.text('SGST AMT', col + 138, y + 1, { align: 'right' });
        doc.text('IGST %', col + 155, y + 1, { align: 'center' });
        doc.text('IGST AMT', W - margin - 2, y + 1, { align: 'right' });
        y += 6.5;

        taxBreakdownRows.forEach((row, rIdx) => {
          if (rIdx % 2 === 0) { doc.setFillColor('#f8fafc'); doc.rect(col, y - 3.5, W - margin * 2, 5.5, 'F'); }
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor('#1e293b');
          doc.text(`GST ${row.rate}%`, col + 2, y);
          doc.text(row.taxable.toFixed(2), col + 50, y, { align: 'right' });
          doc.text(isIntraState ? `${row.rate / 2}%` : '0%', col + 68, y, { align: 'center' });
          doc.text(row.cgst.toFixed(2), col + 94, y, { align: 'right' });
          doc.text(isIntraState ? `${row.rate / 2}%` : '0%', col + 112, y, { align: 'center' });
          doc.text(row.sgst.toFixed(2), col + 138, y, { align: 'right' });
          doc.text(!isIntraState ? `${row.rate}%` : '0%', col + 155, y, { align: 'center' });
          doc.text(row.igst.toFixed(2), W - margin - 2, y, { align: 'right' });
          y += 5.5;
        });

        doc.setFillColor('#F0F5FA'); doc.rect(col, y - 3.5, W - margin * 2, 6, 'F');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#04325E');
        doc.text('Total', col + 2, y);
        doc.text(taxBreakdownRows.reduce((s, r) => s + r.taxable, 0).toFixed(2), col + 50, y, { align: 'right' });
        doc.text(taxBreakdownRows.reduce((s, r) => s + r.cgst, 0).toFixed(2), col + 94, y, { align: 'right' });
        doc.text(taxBreakdownRows.reduce((s, r) => s + r.sgst, 0).toFixed(2), col + 138, y, { align: 'right' });
        doc.text(taxBreakdownRows.reduce((s, r) => s + r.igst, 0).toFixed(2), W - margin - 2, y, { align: 'right' });
        y += 6.5;

        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#1A63A8');
        doc.text(`Tax Amount (in words): ${numberToWords(totalTaxVal, isIndianCurrency)}`, col + 2, y, { maxWidth: W - margin * 2 - 4 });
        y += 7;
      }

      // QR code (left) & Authorised Signatory (right)
      const qrCanvas = document.getElementById('upi-qr-code-canvas') as HTMLCanvasElement | null;
      const bottomBlockY = Math.max(y + 2, 240);
      if (activeUpiId && grandTotal > 0 && qrCanvas) {
        await new Promise<void>((resolve) => {
          const styledCanvas = document.createElement('canvas');
          const ctx2 = styledCanvas.getContext('2d');
          if (!ctx2) { resolve(); return; }
          const sc = 3;
          const sw = 200 * sc; const sh = 200 * sc;
          styledCanvas.width = sw; styledCanvas.height = sh;
          ctx2.imageSmoothingEnabled = true; ctx2.imageSmoothingQuality = 'high';
          ctx2.fillStyle = '#F8FAFC'; ctx2.fillRect(0, 0, sw, sh);
          ctx2.fillStyle = '#04325E'; ctx2.fillRect(0, 0, sw, 44 * sc);
          ctx2.textAlign = 'center';
          ctx2.fillStyle = '#ffffff'; ctx2.font = `bold ${8 * sc}px sans-serif`;
          ctx2.fillText((settings?.shopName || 'POS Suite 360').toUpperCase(), sw / 2, 18 * sc);
          ctx2.fillStyle = '#94A3B8'; ctx2.font = `bold ${6 * sc}px sans-serif`;
          ctx2.fillText('SCAN TO PAY', sw / 2, 32 * sc);
          ctx2.fillStyle = '#ffffff';
          ctx2.fillRect(8 * sc, 48 * sc, sw - 16 * sc, 140 * sc);
          const qrSz = 80 * sc;
          ctx2.drawImage(qrCanvas, (sw - qrSz) / 2, 52 * sc, qrSz, qrSz);
          ctx2.fillStyle = '#64748B'; ctx2.font = `bold ${5 * sc}px sans-serif`;
          ctx2.fillText(`INVOICE: #${invoiceNo}`, sw / 2, 142 * sc);
          ctx2.fillStyle = '#0F172A'; ctx2.font = `bold ${8 * sc}px sans-serif`;
          ctx2.fillText(`${pdfCurr} ${Number(grandTotal).toFixed(2)}`, sw / 2, 158 * sc);
          ctx2.fillStyle = '#64748B'; ctx2.font = `${4.5 * sc}px sans-serif`;
          ctx2.fillText(activeUpiId.trim(), sw / 2, 172 * sc);
          styledCanvas.toBlob((blob) => {
            if (!blob) { resolve(); return; }
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const qrY = Math.min(bottomBlockY, 244);
              const qrW = 34; const qrH = 34;
              doc.addImage(dataUrl, 'PNG', col, qrY, qrW, qrH);
              const dlUrl = window.location.origin + '/upi-redirect?pa=' + encodeURIComponent(activeUpiId.trim()) + '&pn=' + encodeURIComponent((settings && settings.shopName) || 'Shop') + '&tr=' + encodeURIComponent(invoiceNo) + '&am=' + Number(grandTotal).toFixed(2) + '&cu=INR';
              doc.link(col, qrY, qrW, qrH, { url: dlUrl });
              resolve();
            };
            reader.readAsDataURL(blob);
          }, 'image/png');
        });
      }

      if (!isEstimation) {
        const sigY = Math.min(bottomBlockY + 2, 260);
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#1e293b');
        doc.text(`For ${(settings?.shopName || 'POS Suite 360').toUpperCase()}`, W - margin, sigY, { align: 'right' });
        doc.setDrawColor('#94a3b8'); doc.setLineWidth(0.3);
        doc.line(W - margin - 45, sigY + 14, W - margin, sigY + 14);
        doc.setFontSize(8); doc.setTextColor('#475569');
        doc.text('Authorised Signatory', W - margin - 22.5, sigY + 18, { align: 'center' });
      }

      // Footer
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#64748b');
      if (settings?.jurisdiction) {
        doc.text(settings.jurisdiction.toUpperCase(), W / 2, 283, { align: 'center' });
      }
      doc.setFont('helvetica', 'normal'); doc.setTextColor('#94a3b8');
      doc.text(`This is a computer generated invoice | Thank you for partnering with ${settings?.shopName || 'POS Suite 360'}!`, W / 2, 288, { align: 'center' });

      const pdfBlob = doc.output('blob');
      const file = new File([pdfBlob], `Invoice_${invoiceNo}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${isEstimation ? 'Estimation' : 'Invoice'} ${invoiceNo}` });
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = `Invoice_${invoiceNo}.pdf`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error('Error generating/sharing PDF:', err);
    } finally {
      setIsSharing(false);
    }
  };

  const handleDownloadQR = async () => {
    const qrCanvas = document.getElementById('upi-qr-code-canvas') as HTMLCanvasElement;
    if (!qrCanvas) { toast.error('QR code is not available'); return; }
    setIsDownloadingQR(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d context');
      const scale = 3;
      const width = 400 * scale; const height = 650 * scale;
      canvas.width = width; canvas.height = height;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) => {
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
      };
      ctx.fillStyle = '#F8FAFC'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#04325E'; ctx.fillRect(0, 0, width, 180 * scale);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff'; ctx.font = `bold ${22 * scale}px sans-serif`;
      ctx.fillText((settings?.shopName || 'POS Suite 360').toUpperCase(), width / 2, 70 * scale);
      ctx.fillStyle = '#94A3B8'; ctx.font = `bold ${13 * scale}px sans-serif`;
      (ctx as any).letterSpacing = `${2 * scale}px`;
      ctx.fillText('SCAN TO PAY', width / 2, 105 * scale);
      (ctx as any).letterSpacing = '0px';
      const cardMargin = 30 * scale; const cardY = 140 * scale;
      const cardWidth = width - cardMargin * 2; const cardHeight = 440 * scale;
      roundRect(ctx, cardMargin, cardY + 8 * scale, cardWidth, cardHeight, 16 * scale, '#E2E8F0');
      roundRect(ctx, cardMargin, cardY, cardWidth, cardHeight, 16 * scale, '#ffffff');
      const qrSize = 240 * scale; const qrX = (width - qrSize) / 2; const qrYPos = cardY + 30 * scale;
      ctx.drawImage(qrCanvas, qrX, qrYPos, qrSize, qrSize);
      let currentY = qrYPos + qrSize + 45 * scale;
      ctx.fillStyle = '#64748B'; ctx.font = `bold ${13 * scale}px sans-serif`;
      ctx.fillText(`INVOICE NO: #${invoiceNo}`, width / 2, currentY);
      currentY += 40 * scale;
      ctx.fillStyle = '#0F172A'; ctx.font = `bold ${26 * scale}px sans-serif`;
      ctx.fillText(`${currency} ${Number(grandTotal).toFixed(2)}`, width / 2, currentY);
      currentY += 45 * scale;
      const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
        const img = new Image(); img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img); img.onerror = reject; img.src = src;
      });
      try {
        const [gpayImg, phonepeImg, paytmImg, upiImg] = await Promise.all([
          loadImage('/icons/gpay.png'), loadImage('/icons/phonepe.png'),
          loadImage('/icons/paytm.png'), loadImage('/icons/upi.png')
        ]);
        const drawImageAspect = (img: HTMLImageElement, x: number, y: number, maxW: number, maxH: number) => {
          const ratio = Math.min(maxW / (img.width || 100), maxH / (img.height || 40));
          const fw = (img.width || 100) * ratio; const fh = (img.height || 40) * ratio;
          ctx.drawImage(img, x + (maxW - fw) / 2, y + (maxH - fh) / 2, fw, fh);
        };
        const iconSize = 44 * scale; const overlap = 14 * scale;
        const totalW = 4 * iconSize - 3 * overlap;
        let startX = (width - totalW) / 2;
        [gpayImg, phonepeImg, paytmImg, upiImg].forEach((img) => {
          ctx.beginPath(); ctx.arc(startX + iconSize / 2, currentY, iconSize / 2 + 1.5 * scale, 0, 2 * Math.PI);
          ctx.fillStyle = '#cbd5e1'; ctx.fill();
          ctx.beginPath(); ctx.arc(startX + iconSize / 2, currentY, iconSize / 2, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff'; ctx.fill();
          ctx.save(); ctx.beginPath(); ctx.arc(startX + iconSize / 2, currentY, iconSize / 2, 0, 2 * Math.PI); ctx.clip();
          const p = 8 * scale;
          drawImageAspect(img, startX + p, currentY - iconSize / 2 + p, iconSize - p * 2, iconSize - p * 2);
          ctx.restore(); startX += iconSize - overlap;
        });
      } catch { ctx.fillStyle = '#16A34A'; ctx.font = `bold ${13 * scale}px sans-serif`; ctx.fillText('✓ ACCEPTING ALL UPI APPS', width / 2, currentY); }
      ctx.fillStyle = '#94A3B8'; ctx.font = `bold ${11 * scale}px sans-serif`;
      ctx.fillText('SECURE PAYMENTS BY POS SUITE 360', width / 2, height - 25 * scale);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `QR_${invoiceNo}.png`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (err) {
      toast.error('Failed to download QR');
    } finally {
      setIsDownloadingQR(false);
    }
  };

  const handleShareQR = async () => {
    const qrCanvas = document.getElementById('upi-qr-code-canvas') as HTMLCanvasElement;
    if (!qrCanvas) {
      toast.error('QR code is not available for this invoice');
      return;
    }

    setIsSharingQR(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d context');

      const scale = 3;
      const width = 400 * scale;
      const height = 650 * scale;
      canvas.width = width;
      canvas.height = height;

      // Ensure high quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Helper function to draw rounded rectangles
      const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };

      // 1. Background (Light Slate)
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, width, height);

      // 2. Header Area (Dark Blue)
      ctx.fillStyle = '#04325E';
      ctx.fillRect(0, 0, width, 180 * scale);

      // 3. Header Text
      ctx.textAlign = 'center';

      // Shop Name
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${22 * scale}px sans-serif`;
      ctx.fillText((settings?.shopName || 'POS Suite 360').toUpperCase(), width / 2, 70 * scale);

      // Subtitle
      ctx.fillStyle = '#94A3B8';
      ctx.font = `bold ${13 * scale}px sans-serif`;
      ctx.letterSpacing = `${2 * scale}px`; // Simulating letter spacing by adding spaces could be done, but standard canvas doesn't support letterSpacing directly in all old browsers. Modern browsers support ctx.letterSpacing.
      (ctx as any).letterSpacing = `${2 * scale}px`;
      ctx.fillText('SCAN TO PAY', width / 2, 105 * scale);
      (ctx as any).letterSpacing = '0px';

      // 4. Floating White Card
      const cardMargin = 30 * scale;
      const cardY = 140 * scale;
      const cardWidth = width - (cardMargin * 2);
      const cardHeight = 440 * scale;

      // Shadow (Draw a slightly offset gray rect)
      roundRect(ctx, cardMargin, cardY + 8 * scale, cardWidth, cardHeight, 16 * scale, '#E2E8F0');
      // Main Card
      roundRect(ctx, cardMargin, cardY, cardWidth, cardHeight, 16 * scale, '#ffffff');

      // 5. QR Code inside the card
      const qrSize = 240 * scale;
      const qrX = (width - qrSize) / 2;
      const qrY = cardY + 30 * scale;
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      // 6. Payment Details inside card
      let currentY = qrY + qrSize + 45 * scale;

      ctx.fillStyle = '#64748B';
      ctx.font = `bold ${13 * scale}px sans-serif`;
      ctx.fillText(`INVOICE NO: #${invoiceNo}`, width / 2, currentY);

      currentY += 40 * scale;
      ctx.fillStyle = '#0F172A';
      ctx.font = `bold ${26 * scale}px sans-serif`;
      ctx.fillText(`${currency} ${Number(grandTotal).toFixed(2)}`, width / 2, currentY);

      currentY += 45 * scale;

      const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      };

      try {
        const [gpayImg, phonepeImg, paytmImg, upiImg] = await Promise.all([
          loadImage('/icons/gpay.png'),
          loadImage('/icons/phonepe.png'),
          loadImage('/icons/paytm.png'),
          loadImage('/icons/upi.png')
        ]);

        const drawImageAspect = (img: HTMLImageElement, x: number, y: number, maxWidth: number, maxHeight: number) => {
          let w = img.width || 100;
          let h = img.height || 40;
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          const finalW = w * ratio;
          const finalH = h * ratio;
          const offsetX = x + (maxWidth - finalW) / 2;
          const offsetY = y + (maxHeight - finalH) / 2;
          ctx.drawImage(img, offsetX, offsetY, finalW, finalH);
        };

        const centerY = currentY;
        const iconSize = 44 * scale;
        const overlap = 14 * scale;
        const totalW = (4 * iconSize) - (3 * overlap);
        let startX = (width - totalW) / 2;

        const imgs = [gpayImg, phonepeImg, paytmImg, upiImg];
        imgs.forEach((img) => {
          // Draw a thin grey border circle to distinguish overlap
          ctx.beginPath();
          ctx.arc(startX + (iconSize / 2), centerY, (iconSize / 2) + (1.5 * scale), 0, 2 * Math.PI);
          ctx.fillStyle = '#cbd5e1';
          ctx.fill();

          // Draw inner white circle
          ctx.beginPath();
          ctx.arc(startX + (iconSize / 2), centerY, iconSize / 2, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          // Create circular clipping path for the image
          ctx.save();
          ctx.beginPath();
          ctx.arc(startX + (iconSize / 2), centerY, iconSize / 2, 0, 2 * Math.PI);
          ctx.clip();

          // Draw the image inside (with padding)
          const padding = 8 * scale;
          drawImageAspect(img, startX + padding, centerY - (iconSize / 2) + padding, iconSize - (padding * 2), iconSize - (padding * 2));

          ctx.restore();

          startX += iconSize - overlap;
        });
      } catch (err) {
        console.error('Failed to load payment icons', err);
        ctx.fillStyle = '#16A34A';
        ctx.font = `bold ${13 * scale}px sans-serif`;
        ctx.fillText('✓ ACCEPTING ALL UPI APPS', width / 2, currentY);
      }

      // 7. Footer Watermark
      ctx.fillStyle = '#94A3B8';
      ctx.font = `bold ${11 * scale}px sans-serif`;
      ctx.fillText('SECURE PAYMENTS BY POS SUITE 360', width / 2, height - 25 * scale);

      await new Promise<void>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            resolve();
            return;
          }
          const file = new File([blob], `Pay_${invoiceNo}.png`, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({ files: [file], title: `Pay Invoice ${invoiceNo}` });
            } catch (err: any) {
              if (err.name !== 'AbortError') {
                console.error('Error sharing QR code:', err);
              }
            }
          } else {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Pay_${invoiceNo}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
          resolve();
        }, 'image/png');
      });
    } catch (err) {
      console.error('Error sharing QR Code:', err);
      toast.error('Failed to share QR Code');
    } finally {
      setIsSharingQR(false);
    }
  };

  const ThermalContent = () => (
    <div className="w-full bg-white text-black text-[11px] p-2" style={{ fontFamily: 'monospace', maxWidth: '80mm' }}>
      <div className="text-center mb-2">
        {settings?.logoImage && <img src={settings.logoImage} alt="Logo" className="h-10 mx-auto mb-1 object-contain" />}
        <p className="font-bold text-[13px] uppercase">{settings?.shopName || 'POS Suite 360'}</p>
        {settings?.invoiceTitle && <p className="text-[10px]">{settings.invoiceTitle}</p>}
        {settings?.shopAddress && <p className="text-[10px]">{settings.shopAddress}</p>}
        {[settings?.city, settings?.state].filter(Boolean).length > 0 && <p className="text-[10px]">{[settings?.city, settings?.state].filter(Boolean).join(', ')}</p>}
        {settings?.phone && <p className="text-[10px]">Tel: {settings.phone}</p>}
        {settings?.gstin && <p className="text-[10px]">GSTIN: {settings.gstin}</p>}
      </div>
      <div className="border-t border-dashed border-black my-1" />
      <div className="text-[10px] mb-1">
        <p className="font-bold">{isEstimation ? 'BILL' : 'INVOICE'}: #{invoiceNo}</p>
        <p>Date: {date}</p>
        {sale?.customer?.name !== 'Cash Customer' && <p>Customer: {customerName}</p>}
        {sale?.customer?.phone && sale?.customer?.name !== 'Cash Customer' && <p>Phone: {sale.customer.phone}</p>}
        <p>Payment: {sale?.paymentMode?.name || 'Cash'}</p>
      </div>
      <div className="border-t border-dashed border-black my-1" />
      <table className="w-full text-[10px]">
        <thead>
          <tr className="font-bold">
            <td className="pb-1">Item</td>
            <td className="pb-1 text-center">Qty</td>
            <td className="pb-1 text-right">Rate</td>
            <td className="pb-1 text-right">Amt</td>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, idx: number) => (
            <tr key={idx}>
              <td className="py-0.5 pr-1 max-w-[28mm] break-words">{item.isService ? (item.itemName || item.serviceItem?.name || '') : (item.product?.name || '')}</td>
              <td className="py-0.5 text-center whitespace-nowrap">{item.quantity} {item.isService ? 'Svc' : (item.product?.unit?.shortCode || '')}</td>
              <td className="py-0.5 text-right whitespace-nowrap">{Number(item.rate || 0).toFixed(2)}</td>
              <td className="py-0.5 text-right whitespace-nowrap font-bold">{Number(item.amount || item.total || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-dashed border-black my-1" />
      <div className="text-[10px] space-y-0.5">
        <div className="flex justify-between"><span>Subtotal:</span><span>{Number(sale?.subtotal || 0).toFixed(2)}</span></div>
        {settings?.enableTax && Number(sale?.tax) > 0 && (
          <div className="flex justify-between"><span>Tax:</span><span>{Number(sale.tax).toFixed(2)}</span></div>
        )}
        {Number(sale?.discount) > 0 && (
          <div className="flex justify-between"><span>Discount:</span><span>-{Number(sale.discount).toFixed(2)}</span></div>
        )}
      </div>
      <div className="border-t border-black my-1" />
      <div className="flex justify-between font-bold text-[13px]">
        <span>TOTAL:</span>
        <span>{currency} {Number(grandTotal).toFixed(2)}</span>
      </div>
      <p className="text-[9px] mt-0.5">{numberToWords(grandTotal, isIndianCurrency)}</p>
      {activeUpiId && grandTotal > 0 && (
        <div className="flex flex-col items-center mt-2">
          <QRCodeCanvas
            id="upi-qr-code-canvas"
            value={`upi://pay?pa=${activeUpiId.trim()}&pn=${encodeURIComponent(settings?.shopName || 'Shop')}&tr=${encodeURIComponent(invoiceNo)}&am=${Number(grandTotal).toFixed(2)}&cu=INR`}
            size={120}
            level="M"
          />
          <p className="text-[9px] mt-0.5">UPI: {activeUpiId.trim()}</p>
        </div>
      )}
      <div className="border-t border-dashed border-black my-1" />
      <p className="text-center text-[10px]">Thank you! Visit again.</p>
    </div>
  );

  const isA5 = printFormat === 'a5';

  const InvoiceContent = () => (
    <div 
      className={`flex flex-col bg-white text-slate-800 ${hiddenRenderer ? 'w-[800px] min-h-[1100px] box-border p-10 text-[13px]' : isA5 ? 'p-2 sm:p-4 text-[9px] print:p-3' : 'p-2.5 sm:p-8 text-[11px] sm:text-[12px] print:p-6 print:text-[11px]'} print:flex-1 print:overflow-visible`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Header */}
      <div className={`flex justify-between items-start gap-3 ${isA5 ? 'mb-2 sm:mb-3' : 'mb-3 sm:mb-5'}`}>
        <div className="flex items-start gap-3 sm:gap-4">
          {settings?.logoImage && (
            <img src={settings.logoImage} alt="Logo" className={`${isA5 ? 'max-h-10 max-w-[70px]' : 'max-h-16 sm:max-h-20 max-w-[110px] sm:max-w-[150px]'} w-auto h-auto object-contain object-left shrink-0`} />
          )}
          <div>
            <h1 className={`${isA5 ? 'text-sm sm:text-base' : settings?.logoImage ? 'text-base sm:text-xl' : 'text-xl sm:text-2xl'} font-bold text-[#04325E] uppercase tracking-tight leading-snug`}>{settings?.shopName || 'POS Suite 360'}</h1>
            {settings?.invoiceTitle && <p className={`text-[#1A63A8] font-bold ${isA5 ? 'text-[8px] sm:text-[9px]' : 'text-xs sm:text-sm'} mt-0.5`}>{settings.invoiceTitle}</p>}
            <div className={`${isA5 ? 'mt-1 text-[8px]' : 'mt-1 sm:mt-1.5 text-[10px] sm:text-xs'} text-slate-700 leading-relaxed`}>
              {settings?.shopAddress && <p>{settings.shopAddress}</p>}
              <p className="font-semibold text-slate-700">{[settings?.city, settings?.state, settings?.country].filter(Boolean).join(', ')}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {settings?.phone && <span>Tel: <strong className="text-slate-800">{settings.phone}</strong></span>}
                {settings?.gstin && <span>GSTIN: <strong className="text-slate-800">{settings.gstin}</strong></span>}
              </div>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <h2 className={`${isA5 ? 'text-base sm:text-lg' : 'text-xl sm:text-3xl'} font-black text-[#1A63A8] tracking-wider mb-0.5 sm:mb-1`}>{isEstimation ? 'BILL' : 'TAX INVOICE'}</h2>
          <p className={`font-bold text-slate-700 ${isA5 ? 'text-[8px] sm:text-[9px]' : 'text-xs sm:text-sm'}`}>{isEstimation ? 'Est No' : 'Invoice No'}: #{invoiceNo}</p>
        </div>
      </div>

      {/* Info Cards: Buyer & Invoice Details */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-2 sm:gap-4 ${isA5 ? 'mb-2' : 'mb-3 sm:mb-4'}`}>
        <div className={`bg-slate-50 border border-slate-200/80 rounded-lg ${isA5 ? 'p-2' : 'p-2.5 sm:p-3.5'}`}>
          <h3 className="text-[9px] font-black text-[#1A63A8] uppercase tracking-widest mb-1">Buyer / Billed To</h3>
          <p className={`font-bold text-slate-900 ${isA5 ? 'text-[9px]' : 'text-xs sm:text-sm'} mb-0.5`}>{customerName}</p>
          <div className={`${isA5 ? 'text-[8px]' : 'text-[10px] sm:text-[11px]'} text-slate-700 space-y-0.5 leading-snug`}>
            {sale?.customer?.address && <p>{sale.customer.address}</p>}
            {(custStateInfo.name || custStateInfo.code) && (
              <p className="flex flex-wrap gap-x-3">
                {custStateInfo.name && <span>State: <strong className="text-slate-800">{custStateInfo.name}</strong></span>}
                {custStateInfo.code && <span>State Code: <strong className="text-slate-800">{custStateInfo.code}</strong></span>}
              </p>
            )}
            {sale?.customer?.phone && <p>Phone: <strong className="text-slate-800">{sale.customer.phone}</strong></p>}
            {sale?.customer?.gstNumber && <p>GSTIN: <strong className="text-slate-900">{sale.customer.gstNumber}</strong></p>}
          </div>
        </div>
        <div className={`bg-slate-50 border border-slate-200/80 rounded-lg ${isA5 ? 'p-2' : 'p-2.5 sm:p-3.5'}`}>
          <h3 className="text-[9px] font-black text-[#1A63A8] uppercase tracking-widest mb-1">{isEstimation ? 'Estimation Details' : 'Invoice Details'}</h3>
          <div className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 sm:gap-y-1 ${isA5 ? 'text-[8px]' : 'text-[10px] sm:text-[11px]'}`}>
            <span className="font-bold text-slate-600">{isEstimation ? 'Est No:' : 'Invoice No:'}</span>
            <span className="text-slate-900 font-bold">#{invoiceNo}</span>
            <span className="font-bold text-slate-600">Invoice Date:</span>
            <span className="text-slate-800 font-medium">{date}</span>
            {sellerPan && (
              <>
                <span className="font-bold text-slate-600">PAN No:</span>
                <span className="text-slate-800 font-semibold uppercase">{sellerPan}</span>
              </>
            )}
            <span className="font-bold text-slate-600">Payment Mode:</span>
            <span className="text-slate-800 capitalize font-medium">{sale?.paymentMode?.name || 'Cash'}</span>
            {Number(sale?.customer?.openingBalance) > 0 && (
              <>
                <span className="font-bold text-slate-600">Pending Bal:</span>
                <span className="text-slate-800 font-semibold">{currency} {Number(sale.customer.openingBalance).toFixed(2)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className={`border border-slate-200 rounded-lg ${isA5 ? 'mb-2' : 'mb-3 sm:mb-4'} overflow-x-auto print:overflow-visible`}>
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#2D6AA1] text-white uppercase tracking-wider text-[7.5px] sm:text-[9.5px] print:text-[9.5px]">
            <tr>
              <th className="py-2 px-1 sm:py-2.5 sm:px-2 font-bold text-center w-[6%]">S.No</th>
              <th className="py-2 px-1.5 sm:py-2.5 sm:px-2.5 font-bold">Description of Goods</th>
              <th className="py-2 px-1 sm:py-2.5 sm:px-2 font-bold text-center">HSN</th>
              {showTaxColumns && <th className="py-2 px-1 sm:py-2.5 sm:px-2 font-bold text-center">GST %</th>}
              <th className="py-2 px-1 sm:py-2.5 sm:px-2 font-bold text-center">Qty</th>
              <th className="py-2 px-1 sm:py-2.5 sm:px-2 font-bold text-right">Rate</th>
              {showMrpColumn && <th className="py-2 px-1 sm:py-2.5 sm:px-2 font-bold text-right">MRP</th>}
              <th className="py-2 px-1.5 sm:py-2.5 sm:px-2.5 font-bold text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[8.5px] sm:text-[10.5px] print:text-[10.5px]">
            {items.map((item: any, idx: number) => {
              const displayName = item.isService 
                ? (item.itemName || item.serviceItem?.name || '')
                : (item.product?.name || '');
              const itemAmt = Number(item.amount || item.total || 0);
              const itemTax = Number(item.tax || 0);
              const itemTaxable = amountIsPreTax ? itemAmt : Math.max(0, itemAmt - itemTax);
              let gstRate = Number(!item.isService ? item.product?.taxPercent : item.serviceItem?.taxPercent) || 0;
              if (gstRate === 0 && itemTax > 0 && itemTaxable > 0) {
                gstRate = Math.round((itemTax / itemTaxable) * 100);
              }
              const mrpVal = Number(!item.isService ? item.product?.mrp : 0) || 0;
              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="py-1.5 px-1 sm:py-2 sm:px-2 text-center text-slate-500 font-medium">{idx + 1}</td>
                  <td className="py-1.5 px-1.5 sm:py-2 sm:px-2.5">
                    <span className="font-bold text-slate-800 break-words">{displayName}</span>
                    {!item.isService && item.product?.code && (
                      <span className="text-slate-500 text-[7.5px] sm:text-[9px] ml-1 whitespace-nowrap">({item.product.code})</span>
                    )}
                  </td>
                  <td className="py-1.5 px-1 sm:py-2 sm:px-2 text-center text-slate-600">{!item.isService ? (item.product?.hsnCode || '-') : '-'}</td>
                  {showTaxColumns && (
                    <td className="py-1.5 px-1 sm:py-2 sm:px-2 text-center text-slate-600 whitespace-nowrap">
                      {gstRate > 0 ? `GST ${gstRate}%` : '0%'}
                    </td>
                  )}
                  <td className="py-1.5 px-1 sm:py-2 sm:px-2 text-center text-slate-700 font-medium whitespace-nowrap">
                    {Number(item.quantity || 0)} {item.isService ? 'Svc' : (item.product?.unit?.shortCode || 'Nos')}
                  </td>
                  <td className="py-1.5 px-1 sm:py-2 sm:px-2 text-right text-slate-700 whitespace-nowrap">{Number(item.rate || 0).toFixed(2)}</td>
                  {showMrpColumn && (
                    <td className="py-1.5 px-1 sm:py-2 sm:px-2 text-right text-slate-500 whitespace-nowrap">
                      {mrpVal > 0 ? mrpVal.toFixed(2) : '-'}
                    </td>
                  )}
                  <td className="py-1.5 px-1.5 sm:py-2 sm:px-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{itemAmt.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#F0F5FA] border-t-2 border-[#1A63A8] text-[#04325E] font-bold text-[8.5px] sm:text-[10.5px] print:text-[10.5px]">
              <td className="py-1.5 px-1 sm:py-2 sm:px-2 text-center"></td>
              <td className="py-1.5 px-1.5 sm:py-2 sm:px-2.5 uppercase tracking-wide">Total</td>
              <td className="py-1.5 px-1 sm:py-2 sm:px-2"></td>
              {showTaxColumns && <td className="py-1.5 px-1 sm:py-2 sm:px-2"></td>}
              <td className="py-1.5 px-1 sm:py-2 sm:px-2 text-center whitespace-nowrap">{Number(totalQty).toFixed(2)}</td>
              <td className="py-1.5 px-1 sm:py-2 sm:px-2"></td>
              {showMrpColumn && <td className="py-1.5 px-1 sm:py-2 sm:px-2"></td>}
              <td className="py-1.5 px-1.5 sm:py-2 sm:px-2.5 text-right whitespace-nowrap">{currency} {itemsAmountSum.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Totals & Left Details Grid */}
      <div className={`grid gap-3 ${isA5 ? 'grid-cols-[1fr_165px] mb-2' : 'grid-cols-1 sm:grid-cols-[1fr_320px] print:grid-cols-[1fr_320px] sm:gap-5 mb-3'}`}>
        {/* Left: Bank Details + Terms */}
        <div className="flex flex-col gap-2 order-2 sm:order-1 print:order-1">
          {hasBankDetails && (
            <div className={`bg-slate-50 border border-slate-200/80 rounded-lg ${isA5 ? 'p-2' : 'p-2.5 sm:p-3'}`}>
              <h3 className="text-[9px] font-bold text-[#1A63A8] uppercase tracking-widest mb-1">Company&apos;s Bank Details</h3>
              <div className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 ${isA5 ? 'text-[8px]' : 'text-[10px] sm:text-[11px]'} text-slate-700`}>
                {settings?.bankName && (
                  <>
                    <span className="font-bold text-slate-600">Bank Name:</span>
                    <span className="font-semibold text-slate-900">{settings.bankName}</span>
                  </>
                )}
                {settings?.bankAccountNo && (
                  <>
                    <span className="font-bold text-slate-600">Account No:</span>
                    <span className="font-semibold text-slate-900">{settings.bankAccountNo}</span>
                  </>
                )}
                {settings?.bankBranchIfsc && (
                  <>
                    <span className="font-bold text-slate-600">Branch &amp; IFSC Code:</span>
                    <span className="font-semibold text-slate-900">{settings.bankBranchIfsc}</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className={`bg-slate-50 border border-slate-200/80 rounded-lg ${isA5 ? 'p-2' : 'p-2.5 sm:p-3'} flex-1 flex flex-col`}>
            <h3 className="text-[9px] font-bold text-[#1A63A8] uppercase tracking-widest mb-1">Terms &amp; Conditions</h3>
            <div
              className={`${isA5 ? 'text-[8px]' : 'text-[10px] sm:text-[10.5px]'} text-slate-700 font-medium prose prose-sm max-w-none html-content flex-1`}
              dangerouslySetInnerHTML={{ __html: (settings?.invoiceNotes !== undefined && settings?.invoiceNotes !== null) ? settings.invoiceNotes : '1. Goods once sold cannot be taken back or exchanged.<br/>2. Subject to Salem jurisdiction.' }}
            />
          </div>
        </div>

        {/* Right: Calculation Summary */}
        <div className="flex flex-col justify-start order-1 sm:order-2 print:order-2">
          <div className={`bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg ${isA5 ? 'pt-2 pb-1' : 'pt-2.5 pb-1.5'} flex flex-col`}>
            <div className={`${isA5 ? 'space-y-0.5 text-[8.5px] px-2 mb-1' : 'space-y-1.5 text-[11px] sm:text-[12px] px-3 sm:px-4 mb-2'}`}>
              <div className="flex justify-between text-[#334155]">
                <span>Amount:</span>
                <span className="font-semibold">{subtotalVal.toFixed(2)}</span>
              </div>
              {discountVal > 0 && (
                <>
                  <div className="flex justify-between text-[#334155]">
                    <span>Discount:</span>
                    <span className="font-semibold">-{discountVal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#334155] border-t border-slate-200 pt-1 font-semibold">
                    <span>Total:</span>
                    <span>{taxableTotalVal.toFixed(2)}</span>
                  </div>
                </>
              )}
              {showTaxColumns && totalTaxVal > 0 && (
                <>
                  <div className="flex justify-between text-[#334155]">
                    <span>Sales CGST:</span>
                    <span className="font-semibold">{cgstTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#334155]">
                    <span>Sales SGST:</span>
                    <span className="font-semibold">{sgstTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#334155]">
                    <span>Sales IGST:</span>
                    <span className="font-semibold">{igstTotal.toFixed(2)}</span>
                  </div>
                </>
              )}
              {freightVal > 0 && (
                <div className="flex justify-between text-[#334155]">
                  <span>Freight Charges (+):</span>
                  <span className="font-semibold">{freightVal.toFixed(2)}</span>
                </div>
              )}
              {hasRoundOff && (
                <div className="flex justify-between text-[#334155]">
                  <span>Round Off:</span>
                  <span className="font-semibold">{roundOffVal > 0 ? `+${roundOffVal.toFixed(2)}` : roundOffVal.toFixed(2)}</span>
                </div>
              )}
            </div>
            <div className={`bg-[#F0F5FA] border-t-2 border-[#1A63A8] ${isA5 ? 'px-2 py-1' : 'px-3 py-2 sm:px-4 sm:py-2.5'} flex justify-between items-center text-[#04325E] rounded-b-md`}>
              <span className={`font-bold ${isA5 ? 'text-[10px]' : 'text-xs sm:text-[14px]'}`}>Total Due:</span>
              <span className={`font-black tracking-tight ${isA5 ? 'text-[10px]' : 'text-sm sm:text-[15px]'}`}>{currency} {grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Amount Chargeable in Words + E. & O.E */}
      <div className={`bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg ${isA5 ? 'px-2 py-1.5 mb-2' : 'px-3 py-2 sm:px-4 mb-3'} flex justify-between items-start gap-2`}>
        <div>
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-wider">Amount Chargeable (in words)</p>
          <p className={`${isA5 ? 'text-[8px]' : 'text-[10px] sm:text-[11px]'} font-extrabold text-[#04325E] uppercase mt-0.5`}>
            {numberToWords(grandTotal, isIndianCurrency)}
          </p>
        </div>
        <span className="text-[8px] sm:text-[9px] font-bold text-slate-600 shrink-0">E. &amp; O.E</span>
      </div>

      {/* GST Rate-wise Tax Breakdown Table */}
      {showTaxColumns && taxBreakdownRows.length > 0 && (
        <div className={`border border-slate-200 rounded-lg ${isA5 ? 'mb-2' : 'mb-3'} overflow-x-auto print:overflow-visible`}>
          <table className="w-full text-center border-collapse">
            <thead className="bg-[#2D6AA1] text-white uppercase tracking-wider text-[7px] sm:text-[8.5px] print:text-[8.5px]">
              <tr>
                <th rowSpan={2} className="py-1.5 px-2 font-bold text-left border-r border-white/20">GST Rate</th>
                <th rowSpan={2} className="py-1.5 px-2 font-bold text-right border-r border-white/20">Taxable Value</th>
                <th colSpan={2} className="py-1 px-2 font-bold border-b border-r border-white/20">CGST</th>
                <th colSpan={2} className="py-1 px-2 font-bold border-b border-r border-white/20">SGST</th>
                <th colSpan={2} className="py-1 px-2 font-bold border-b border-white/20">IGST</th>
              </tr>
              <tr>
                <th className="py-1 px-1.5 font-bold border-r border-white/20">Rate</th>
                <th className="py-1 px-1.5 font-bold text-right border-r border-white/20">Amount</th>
                <th className="py-1 px-1.5 font-bold border-r border-white/20">Rate</th>
                <th className="py-1 px-1.5 font-bold text-right border-r border-white/20">Amount</th>
                <th className="py-1 px-1.5 font-bold border-r border-white/20">Rate</th>
                <th className="py-1 px-1.5 font-bold text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[8px] sm:text-[10px] print:text-[10px]">
              {taxBreakdownRows.map((row, idx) => (
                <tr key={idx} className="bg-white">
                  <td className="py-1.5 px-2 text-left font-semibold text-slate-800">GST {row.rate} %</td>
                  <td className="py-1.5 px-2 text-right text-slate-700">{row.taxable.toFixed(2)}</td>
                  <td className="py-1.5 px-1.5 text-slate-600">{isIntraState ? `${row.rate / 2} %` : '0 %'}</td>
                  <td className="py-1.5 px-1.5 text-right text-slate-700">{row.cgst.toFixed(2)}</td>
                  <td className="py-1.5 px-1.5 text-slate-600">{isIntraState ? `${row.rate / 2} %` : '0 %'}</td>
                  <td className="py-1.5 px-1.5 text-right text-slate-700">{row.sgst.toFixed(2)}</td>
                  <td className="py-1.5 px-1.5 text-slate-600">{!isIntraState ? `${row.rate} %` : '0 %'}</td>
                  <td className="py-1.5 px-1.5 text-right text-slate-700">{row.igst.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#F0F5FA] border-t border-[#1A63A8] text-[#04325E] font-bold text-[8px] sm:text-[10px] print:text-[10px]">
                <td className="py-1.5 px-2 text-left">Total</td>
                <td className="py-1.5 px-2 text-right">{taxBreakdownRows.reduce((s, r) => s + r.taxable, 0).toFixed(2)}</td>
                <td className="py-1.5 px-1.5"></td>
                <td className="py-1.5 px-1.5 text-right">{taxBreakdownRows.reduce((s, r) => s + r.cgst, 0).toFixed(2)}</td>
                <td className="py-1.5 px-1.5"></td>
                <td className="py-1.5 px-1.5 text-right">{taxBreakdownRows.reduce((s, r) => s + r.sgst, 0).toFixed(2)}</td>
                <td className="py-1.5 px-1.5"></td>
                <td className="py-1.5 px-1.5 text-right">{taxBreakdownRows.reduce((s, r) => s + r.igst, 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <div className={`bg-slate-50 border-t border-slate-200 ${isA5 ? 'px-2 py-1 text-[7.5px]' : 'px-3 py-1.5 text-[9px] sm:text-[10px]'} flex flex-wrap gap-x-2`}>
            <span className="font-bold text-slate-600">Tax Amount (in words):</span>
            <span className="font-extrabold text-[#1A63A8] uppercase">{numberToWords(totalTaxVal, isIndianCurrency)}</span>
          </div>
        </div>
      )}

      {/* Bottom Bar: QR Code & Authorised Signatory */}
      <div className="mt-auto pt-2 flex flex-col sm:flex-row print:flex-row justify-between items-stretch sm:items-end print:items-end gap-3">
        <div>
          {activeUpiId && grandTotal > 0 && (
            <div className={`bg-slate-50 border border-slate-200/80 rounded-lg ${isA5 ? 'p-1.5' : 'p-2 sm:p-2.5'} flex items-center gap-2.5`}>
              <div className="bg-white p-1 rounded border border-slate-200 shadow-sm shrink-0">
                <QRCodeCanvas
                  id="upi-qr-code-canvas"
                  value={`upi://pay?pa=${activeUpiId.trim()}&pn=${encodeURIComponent(settings?.shopName || 'Shop')}&tr=${encodeURIComponent(invoiceNo)}&am=${Number(grandTotal).toFixed(2)}&cu=INR`}
                  size={900}
                  level="M"
                  style={{ width: isA5 ? 40 : 52, height: isA5 ? 40 : 52 }}
                />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-800 uppercase tracking-widest">Scan to Pay</p>
                <p className="text-[8px] text-slate-500 mt-0.5">UPI: {activeUpiId.trim()}</p>
              </div>
            </div>
          )}
        </div>

        {!isEstimation && (
          <div className="text-right relative ml-auto">
            <p className={`${isA5 ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'} font-bold text-[#04325E] uppercase mb-7 sm:mb-9`}>
              For {settings?.shopName || 'POS Suite 360'}
            </p>
            {settings?.signatureImage && (
              <img src={settings.signatureImage} alt="Authorised Signature" className="absolute bottom-5 right-4 h-8 sm:h-9 object-contain opacity-90 mix-blend-multiply" />
            )}
            <div className="inline-block border-t border-slate-400 pt-1 px-4 sm:px-6 min-w-[130px] sm:min-w-[160px]">
              <p className="text-[8px] sm:text-[9.5px] font-bold text-slate-700 text-center">Authorised Signatory</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`${isA5 ? 'mt-2' : 'mt-3 sm:mt-4'} text-center text-[8.5px] sm:text-[9px] font-medium text-slate-600 border-t border-slate-200 pt-2 space-y-0.5`}>
        {settings?.jurisdiction && (
          <p className="font-bold text-slate-700 uppercase tracking-wide">{settings.jurisdiction}</p>
        )}
        <p className="text-slate-500">This is a computer generated invoice | Thank you for partnering with {settings?.shopName || 'POS Suite 360'}! | Page 1 of 1</p>
      </div>
    </div>
  );

  if (hiddenRenderer) {
    return (
      <div id="hidden-printable-invoice" className="fixed top-0 left-0 bg-white" style={{ zIndex: -9999 }}>
        <InvoiceContent />
      </div>
    );
  }

  return createPortal(
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-1 sm:p-4 print:absolute print:inset-0 print:block print:bg-transparent print:m-0 print:p-0 ${autoPrint ? 'opacity-0 pointer-events-none print:opacity-100' : 'bg-black/60'}`}>
      <div className={`bg-white w-full max-w-4xl h-[98vh] sm:h-auto sm:max-h-[90vh] flex flex-col rounded-lg sm:rounded-xl relative print:w-full print:max-w-none print:shadow-none print:h-auto print:min-h-0 ${!autoPrint && 'shadow-2xl'}`}>

        {/* Header - Screen Only */}
        {!autoPrint && (
          <div className="flex justify-between items-center bg-[#111827] text-white px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-t-lg sm:rounded-t-xl print:hidden shrink-0">
            <div className="flex items-center gap-2 font-bold text-xs sm:text-sm truncate">
              <Printer size={16} className="text-blue-400 shrink-0" />
              <span className="truncate">Print {isEstimation ? 'Estimation' : 'Invoice'} - {invoiceNo}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Print format style injection */}
        <style>{`
          @media print {
            @page {
              size: ${printFormat === 'thermal' ? '80mm auto' : printFormat === 'a5' ? 'A5 portrait' : 'A4 portrait'};
              margin: ${printFormat === 'thermal' ? '4mm' : '10mm'};
            }
          }
        `}</style>

        {/* Printable Area */}
        <div id="printable-invoice" className="flex-1 min-h-0 overflow-auto bg-gray-200 p-1 sm:p-8 print:p-0 print:bg-white flex justify-center print:overflow-visible">
          <div className={`bg-white shadow-sm flex flex-col print:w-full print:max-w-none print:shadow-none ${printFormat === 'thermal'
              ? 'w-[80mm] min-h-0 print:min-h-0'
              : printFormat === 'a5'
                ? 'w-full max-w-[148mm] min-h-0 sm:min-h-[210mm] print:min-h-[100vh]'
                : 'w-full max-w-[210mm] min-h-0 sm:min-h-[297mm] print:min-h-[100vh]'
            }`}>
            {printFormat === 'thermal' ? <ThermalContent /> : <InvoiceContent />}
          </div>
        </div>

        {/* Footer Actions - Screen Only */}
        {!autoPrint && (
          <div className="flex flex-wrap justify-between items-center gap-2 p-2.5 sm:p-3 bg-gray-50 border-t border-gray-200 rounded-b-lg sm:rounded-b-xl print:hidden shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={handleWhatsApp}
                disabled={isSharing}
                className="bg-[#25D366] hover:bg-[#128C7E] disabled:opacity-70 text-white px-2.5 sm:px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold text-[11px] sm:text-[12px] transition-colors shadow-sm flex-1 sm:flex-initial"
              >
                {isSharing ? (
                  <><Loader2 size={14} className="animate-spin" /> Preparing...</>
                ) : (
                  <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg> <span>Share Invoice</span></>
                )}
              </button>
              {showPaymentInfo && activeUpiId && grandTotal > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleShareQR}
                    disabled={isSharingQR}
                    className="bg-[#38BDF8] hover:bg-[#0EA5E9] disabled:opacity-70 text-white px-2.5 sm:px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold text-[11px] sm:text-[12px] transition-colors shadow-sm"
                  >
                    {isSharingQR ? (
                      <><Loader2 size={14} className="animate-spin" /> <span className="hidden sm:inline">Preparing...</span></>
                    ) : (
                      <><QrCode size={14} /> <span className="hidden sm:inline">Share QR</span></>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadQR}
                    disabled={isDownloadingQR}
                    className="bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-70 text-white px-2.5 sm:px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold text-[11px] sm:text-[12px] transition-colors shadow-sm"
                  >
                    {isDownloadingQR ? (
                      <><Loader2 size={14} className="animate-spin" /> <span className="hidden sm:inline">Downloading...</span></>
                    ) : (
                      <><Download size={14} /> <span className="hidden sm:inline">Download QR</span></>
                    )}
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-[#04325E] hover:bg-[#032341] text-white px-3 sm:px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 text-[11px] sm:text-[12px] shadow-sm"
              >
                <Printer size={14} /> <span>Print</span><span className="hidden sm:inline"> / Save PDF</span>
              </button>
              <button onClick={onClose} className="px-3 sm:px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-lg text-[11px] sm:text-[12px] shadow-sm">
                Close
              </button>
            </div>
          </div>
        )}

        {/* Hidden container for PDF generation */}
        <div style={{ display: 'none' }}>
          <div id="pdf-invoice-content">
            <div className="w-[800px] bg-white">
              <InvoiceContent />
            </div>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default InvoicePrintModal;
