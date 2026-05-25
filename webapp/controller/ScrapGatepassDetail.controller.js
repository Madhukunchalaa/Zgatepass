sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapGatepassDetail", {

		onInit: function () {
			this.getRouter().getRoute("ScrapGatepassDetail").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var sGpNo = decodeURIComponent(oEvent.getParameter("arguments").gpNo || "");
			this._loadDetail(sGpNo);
		},

		_loadDetail: function (sGpNo) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			var fnFallback = function () {
				that.getView().setModel(new JSONModel({ gatePassNo: sGpNo, items: [] }), "scrapGpDetail");
			};

			if (!oODataModel || !sGpNo) {
				fnFallback();
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ScrapPassHdrSet", {
				filters: [
					new Filter("GatePassType", FilterOperator.EQ, "NRGP"),
					new Filter("GatePassNo", FilterOperator.EQ, sGpNo)
				],
				urlParameters: { "$expand": "ScrapPassItmNav" },
				success: function (oData) {
					var aResults = oData.results || [];
					var oItem = aResults.find(function (item) {
						return item.GatePassNo === sGpNo;
					});
					if (!oItem) {
						sap.ui.core.BusyIndicator.hide();
						fnFallback();
						return;
					}

					// Fetch request details if GatePassReqNo exists
					if (oItem.GatePassReqNo) {
						oODataModel.read("/ScrapReqHdrSet", {
							filters: [
								new Filter("GatePassType", FilterOperator.EQ, "NRGP"),
								new Filter("GatePassReqNo", FilterOperator.EQ, oItem.GatePassReqNo)
							],
							success: function (oReqData) {
								sap.ui.core.BusyIndicator.hide();
								var oReq = oReqData.results && oReqData.results[0];
								if (oReq) {
									oItem.WeighmentTicket = oReq.WeighmentTicket || "";
									oItem.ChallanDate = oReq.ChallanDate || "";
								}
								that._bindDetail(oItem);
							},
							error: function () {
								sap.ui.core.BusyIndicator.hide();
								that._bindDetail(oItem);
							}
						});
					} else {
						sap.ui.core.BusyIndicator.hide();
						that._bindDetail(oItem);
					}
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					fnFallback();
				}
			});
		},

		_bindDetail: function (oItem) {
			var that = this;

			// Format date
			var sDateStr = this._formatDate(oItem.RequestDate);

			// Map items from ScrapPassItmNav
			var aItems = [];
			if (oItem.ScrapPassItmNav && oItem.ScrapPassItmNav.results) {
				aItems = oItem.ScrapPassItmNav.results.map(function (oSub, idx) {
					var sRawUom = (oSub.UOM || "").toUpperCase();
					var sUom = "KG";
					if (sRawUom.indexOf("KG") !== -1 || sRawUom.indexOf("KILOGRAM") !== -1) {
						sUom = "KG";
					} else if (sRawUom.indexOf("LITRE") !== -1 || sRawUom.indexOf("LTR") !== -1 || sRawUom === "L" || sRawUom === "LIT") {
						sUom = "L";
					} else if (sRawUom.indexOf("TON") !== -1 || sRawUom.indexOf("MT") !== -1) {
						sUom = "MT";
					}
					return {
						sno: String(idx + 1),
						itemNo: oSub.ItemNo || "",
						material: oSub.Material || "",
						description: oSub.MaterialDesc || "",
						orderQty: String(oSub.OrderQuantity || "0"),
						sendoutQty: String(oSub.SendoutQuantity || "0"),
						uom: sUom
					};
				});
			}

			var oGpDetails = JSON.parse(localStorage.getItem("mockScrapGpDetails") || "{}");
			var sGatePassNoKey = oItem.GatePassNo || "";
			var sLocalDeliveryNo = (oGpDetails[sGatePassNoKey] && oGpDetails[sGatePassNoKey].deliveryNo) || "";
			var sDeliveryNo = oItem.DCNumber || oItem.deliveryNo || sLocalDeliveryNo || "";

			var sWBTicket = oItem.WBTicketNo || oItem.WeighmentTicket || oItem.weighmentSlipNo || "";
			var sDCDateRaw = oItem.DCDate || oItem.ChallanDate || oItem.challanDateTime || "";
			var sDCDateFormatted = sDCDateRaw ? that._formatDate(sDCDateRaw) : "";

			var oDetailData = {
				gatePassNo: oItem.GatePassNo || "",
				requestId: oItem.GatePassReqNo || "",
				salesDocument: oItem.SalesDocument || "",
				requestDateStr: sDateStr,
				requestDate: oItem.RequestDate || "",
				customerNo: oItem.SoldToParty || "",
				customerName: oItem.CustomerName || "",
				city: oItem.City || "",
				postalCode: oItem.PostalCode || "",
				customerGst: oItem.CustomerGst || "",
				vehicleNo: oItem.VehicleNo || "",
				remarks: oItem.Remarks || "",
				weighmentSlipNo: sWBTicket,
				challanDateTime: sDCDateFormatted,
				deliveryNo: sDeliveryNo,
				items: aItems
			};

			this.getView().setModel(new JSONModel(oDetailData), "scrapGpDetail");
		},

		_formatDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				var dd = String(vDate.getDate()).padStart(2, "0");
				var mm = String(vDate.getMonth() + 1).padStart(2, "0");
				var yyyy = vDate.getFullYear();
				return dd + "/" + mm + "/" + yyyy;
			}
			if (typeof vDate === "string") {
				if (vDate.indexOf("Date") !== -1) {
					var ts = parseInt(vDate.replace(/\/Date\((\d+)\)\//, "$1"), 10);
					if (!isNaN(ts)) return this._formatDate(new Date(ts));
				}
				if (/^\d{8}$/.test(vDate)) {
					if (vDate === "00000000") return "";
					return vDate.substring(6, 8) + "/" + vDate.substring(4, 6) + "/" + vDate.substring(0, 4);
				}
				var aParts = vDate.split("T")[0].split("-");
				if (aParts.length === 3) return aParts[2] + "/" + aParts[1] + "/" + aParts[0];
			}
			return String(vDate);
		},

		onNavBack: function () {
			this.getRouter().navTo("ScrapGatepassList");
		},

		onPrint: async function () {
			var oData = this.getView().getModel("scrapGpDetail").getData();
			var aItems = oData.items || [];

			/* jsPDF is loaded globally in index.html via the resources folder */
			var jsPDF = window.jspdf && window.jspdf.jsPDF;
			if (!jsPDF) {
				sap.m.MessageBox.error("PDF library not available. Please check that jsPDF is loaded.");
				return;
			}

			var doc = new jsPDF("l", "mm", "a4");           // landscape A4
			var pageWidth  = doc.internal.pageSize.width;   // 297
			var pageHeight = doc.internal.pageSize.height;  // 210
			var margin = 12;
			var contentWidth = pageWidth - margin * 2;

			/* ── outer border ── */
			doc.setLineWidth(0.6);
			doc.rect(7, 5, pageWidth - 14, pageHeight - 10);
			doc.setLineWidth(0.2);
			doc.rect(8.5, 6.5, pageWidth - 17, pageHeight - 13);

			/* ── logo ── */
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, "PNG", margin, 9, 32, 12);
			} catch (e) { /* logo optional */ }

			/* ── company header ── */
			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "bold");   doc.setFontSize(14);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
			doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });

			/* ── GP No top-right ── */
			doc.setFontSize(8.5);
			doc.setFont("helvetica", "bold");
			doc.text("GP No : " + (oData.gatePassNo || ""), pageWidth - margin, 12, { align: "right" });
			doc.setFont("helvetica", "normal");
			doc.text("Date : " + (oData.requestDateStr || ""), pageWidth - margin, 17, { align: "right" });

			/* ── separator + title ── */
			doc.setLineWidth(0.5);
			doc.line(margin, 30.5, pageWidth - margin, 30.5);
			doc.setFont("helvetica", "bold"); doc.setFontSize(11);
			doc.text("SCRAP GATE PASS (NRGP)", pageWidth / 2, 37, { align: "center" });
			var titleW = doc.getTextWidth("SCRAP GATE PASS (NRGP)");
			doc.setLineWidth(0.35);
			doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

			/* ── info grid (left + right columns) ── */
			var gridY = 41, gridH = 48;
			var lColW = 150, rColW = contentWidth - lColW;
			var lColX = margin, rColX = margin + lColW;
			var pad = 3, rLH = 5.5;

			doc.setLineWidth(0.3);
			doc.rect(lColX, gridY, contentWidth, gridH);
			doc.line(rColX, gridY, rColX, gridY + gridH);
			doc.setLineWidth(0.2);
			doc.line(lColX, gridY + 9, rColX, gridY + 9);   // horizontal divider in left col

			/* left col — "Please allow" */
			doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
			doc.text("Please allow", lColX + pad, gridY + 6);
			doc.setFont("helvetica", "bold");
			doc.text(oData.customerName || "The Consignee", lColX + 34, gridY + 6);
			doc.setFont("helvetica", "normal");
			var sAddr = (oData.city || "") + (oData.postalCode ? " - " + oData.postalCode : "");
			var splitAddr = doc.splitTextToSize(sAddr, lColW - pad * 2 - 2);
			doc.text(splitAddr, lColX + pad, gridY + 14);
			doc.setFont("helvetica", "italic"); doc.setFontSize(8);
			doc.text("to take out the following scrap material from MEIL premises.", lColX + pad, gridY + gridH - 3.5);

			/* right col — key-value pairs */
			var rc = rColX + pad, ry = gridY + 5.5, lblOff = 28;
			doc.setFontSize(8); doc.setFont("helvetica", "bold");
			doc.text("Req. No:",    rc, ry); doc.setFont("helvetica", "normal"); doc.text(oData.requestId   || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold");
			doc.text("Sales Doc:",  rc, ry); doc.setFont("helvetica", "normal"); doc.text(oData.salesDocument || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold");
			doc.text("Customer:",   rc, ry); doc.setFont("helvetica", "normal"); doc.text(oData.customerNo  || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold");
			doc.text("Vehicle No:", rc, ry); doc.setFont("helvetica", "normal"); doc.text(oData.vehicleNo   || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold");
			doc.text("GST No:",     rc, ry); doc.setFont("helvetica", "normal"); doc.text(oData.customerGst || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold");
			doc.text("Weighment:",  rc, ry); doc.setFont("helvetica", "normal"); doc.text(oData.weighmentSlipNo || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold");
			doc.text("Challan Dt:", rc, ry); doc.setFont("helvetica", "normal"); doc.text(oData.challanDateTime || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold");
			doc.text("Delivery No:", rc, ry); doc.setFont("helvetica", "normal"); doc.text(oData.deliveryNo || "", rc + lblOff, ry);

			/* ── items table ── */
			var tableData = aItems.map(function (it, i) {
				return [
					i + 1,
					it.itemNo   || "",
					it.material || "",
					it.description || "",
					parseFloat(it.orderQty   || 0).toLocaleString("en-IN", { minimumFractionDigits: 3 }),
					parseFloat(it.sendoutQty || 0).toLocaleString("en-IN", { minimumFractionDigits: 3 }),
					it.uom || ""
				];
			});
			// pad to at least 4 rows so the table looks full
			while (tableData.length < 4) { tableData.push(["", "", "", "", "", "", ""]); }

			doc.autoTable({
				startY: gridY + gridH + 1,
				head: [["#", "Item No", "Material", "Description", "Order Qty", "Sendout Qty", "UOM"]],
				body: tableData,
				theme: "grid",
				headStyles: {
					fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold",
					fontSize: 8.5, halign: "center", valign: "middle",
					cellPadding: 3, lineWidth: 0.3, lineColor: [0, 0, 0]
				},
				bodyStyles: {
					fontSize: 8.5,
					cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
					lineColor: [0, 0, 0], lineWidth: 0.25, valign: "middle"
				},
				columnStyles: {
					0: { cellWidth: 10, halign: "center" },
					1: { cellWidth: 22 },
					2: { cellWidth: 30 },
					3: { cellWidth: "auto" },
					4: { cellWidth: 28, halign: "right" },
					5: { cellWidth: 28, halign: "right" },
					6: { cellWidth: 16, halign: "center" }
				},
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;

			/* ── remarks row ── */
			var remH = 9;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, remH);
			doc.line(margin + 26, finalY, margin + 26, finalY + remH);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Remarks:", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "normal");
			var splitRem = doc.splitTextToSize(oData.remarks || "NIL", contentWidth - 33);
			doc.text(splitRem, margin + 29, finalY + 5.5);

			/* ── signature block (4 columns) ── */
			var sigY = finalY + remH + 20;
			var sigLineW = 52;
			var sigGap = (contentWidth - sigLineW * 4) / 3;
			var sigPositions = [
				margin,
				margin + sigLineW + sigGap,
				margin + (sigLineW + sigGap) * 2,
				margin + (sigLineW + sigGap) * 3
			];
			var sigLabels = ["Requested By", "HOD Approval", "Store In-Charge", "Security / Gate"];
			doc.setLineWidth(0.3);
			sigPositions.forEach(function (sx) { doc.line(sx, sigY, sx + sigLineW, sigY); });
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			sigPositions.forEach(function (sx, i) {
				doc.text(sigLabels[i], sx + sigLineW / 2, sigY + 5, { align: "center" });
			});

			/* ── save ── */
			doc.save("ScrapGP_" + (oData.gatePassNo || "Draft") + ".pdf");
			sap.m.MessageToast.show("Scrap Gate Pass Downloaded");
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image();
				img.crossOrigin = "Anonymous";
				img.onload = function () {
					var canvas = document.createElement("canvas");
					canvas.width  = img.width;
					canvas.height = img.height;
					canvas.getContext("2d").drawImage(img, 0, 0);
					resolve(canvas.toDataURL("image/png"));
				};
				img.onerror = reject;
				img.src = url;
			});
		},

		_numberToWords: function (num) {
			var a = ["","One ","Two ","Three ","Four ","Five ","Six ","Seven ","Eight ","Nine ","Ten ","Eleven ","Twelve ","Thirteen ","Fourteen ","Fifteen ","Sixteen ","Seventeen ","Eighteen ","Nineteen "];
			var b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
			if ((num = num.toString()).length > 9) return "overflow";
			var n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) return "";
			var str = "";
			str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore " : "";
			str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh "  : "";
			str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand " : "";
			str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred " : "";
			str += (n[5] != 0) ? ((str !== "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : "";
			return str;
		}

	});
});
