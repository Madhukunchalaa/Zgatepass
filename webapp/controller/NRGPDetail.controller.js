sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.NRGPDetail", {

		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("NRGPDetail").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var oArgs = oEvent.getParameter("arguments");
			var sGPNo = oArgs.gpNo;
			var sGPType = oArgs.gpType || "NRGP";
			if (sGPNo) {
				this._loadData(sGPNo, sGPType);
			}
		},

		_resetModel: function () {
			var oData = {
				GatePassNo: "",
				GatePassreqNo: "",
				GatePassDate: "",
				GatePassType: "NRGP",
				Plant: "",
				FiscalYear: "",
				Department: "",
				Vendor: "",
				VendorGST: "",
				VendorPerson: "",
				City: "",
				ZipCode: "",
				VendorAddress: "",
				PurchasingDoc: "",
				NoOfPacakages: 0,
				VehicleNo: "",
				ModeOfTransport: "Road",
				TransporterName: "",
				TransporterGST: "",
				Remarks: "",
				GPStatus: "",
				StatusState: "None",
				ChallanNumber: "",
				ChallanDate: null,
				GateEntryNo: "",
				EWayBillNo: "",
				EWayBillDate: null,
				DCNotes: "",
				DocOptionIndex: 0,
				TransportByIndex: 1,
				items: [],
				CommentsList: [],
				FinalTotal: "0.00"
			};
			var oModel = this.getView().getModel("nrgp");
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView().setModel(new JSONModel(oData), "nrgp");
			}
		},

		_loadData: function (sGPNo, sGPType) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) return;

			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/OutGatePassSet", {
				filters: [
					new sap.ui.model.Filter("GatePassNo", sap.ui.model.FilterOperator.EQ, sGPNo),
					new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, sGPType || "NRGP")
				],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oResult = oData.results && oData.results[0];
					if (!oResult) {
						MessageBox.error("No data found for Gate Pass No: " + sGPNo);
						return;
					}
					this._mapData(oResult);
				}.bind(this),
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Error loading Gate Pass details.");
				}
			});
		},

		_formatDate: function (vDate) {
			if (!vDate || vDate === "00000000" || vDate === "") { return ""; }
			if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
				var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
				vDate = new Date(ms);
			}
			if (typeof vDate === "string" && /^\d{8}$/.test(vDate)) {
				vDate = new Date(vDate.slice(0, 4), parseInt(vDate.slice(4, 6), 10) - 1, vDate.slice(6, 8));
			}
			if (vDate instanceof Date && !isNaN(vDate)) {
				return vDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).split("/").join("-");
			}
			return String(vDate);
		},

		_getStatusState: function (sStatus) {
			if (sStatus === "CLOSED" || sStatus === "Approved" || sStatus === "APPROVED" || sStatus === "A") return "Success";
			if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT" || sStatus === "Pending" || sStatus === "PENDING") return "Warning";
			if (sStatus === "OPEN") return "Information";
			if (sStatus === "Rejected" || sStatus === "REJECTED" || sStatus === "R") return "Error";
			if (sStatus === "AM" || sStatus === "AMENDMENT") return "Error";
			return "None";
		},

		_mapData: function (oData) {
			var oModel = this.getView().getModel("nrgp");

			oModel.setProperty("/GatePassNo", oData.GatePassNo || "");
			oModel.setProperty("/GatePassreqNo", oData.GatePassReqNo || oData.GatePassreqNo || "");
			oModel.setProperty("/GatePassDate", this._formatDate(oData.GatePassDate));
			oModel.setProperty("/GatePassType", oData.GatePassType || "NRGP");
			oModel.setProperty("/Plant", oData.Plant || "");
			oModel.setProperty("/FiscalYear", oData.FiscalYear || "");
			oModel.setProperty("/Department", oData.Department || "");
			oModel.setProperty("/Vendor", oData.VendorName || oData.Vendor || "");
			oModel.setProperty("/VendorGST", oData.VendorGST || "");
			oModel.setProperty("/VendorPerson", oData.VendorPerson || "");
			oModel.setProperty("/City", oData.City || "");
			oModel.setProperty("/ZipCode", oData.ZipCode || "");
			oModel.setProperty("/VendorAddress", [oData.City, oData.ZipCode].filter(Boolean).join(", "));
			oModel.setProperty("/PurchasingDoc", oData.PurchasingDoc || "");
			oModel.setProperty("/NoOfPacakages", oData.NoOfPacakages || 0);
			oModel.setProperty("/VehicleNo", oData.VehicleNo || "");
			oModel.setProperty("/ModeOfTransport", oData.ModeOfDispatch || "Road");
			oModel.setProperty("/TransporterName", oData.TransporterName || oData.VendorName || "");
			oModel.setProperty("/TransporterGST", oData.TransporterGST || oData.VendorGST || "");
			oModel.setProperty("/Remarks", oData.Remarks || "");
			oModel.setProperty("/GPStatus", oData.GPStatus || "");
			oModel.setProperty("/StatusState", this._getStatusState(oData.GPStatus));
			oModel.setProperty("/ChallanNumber", oData.ChallanNumber || "");
			oModel.setProperty("/GateEntryNo", oData.GateEntryNo || "");

			var aRaw = (oData.OutgateNav && oData.OutgateNav.results) || [];
			var aMapped = aRaw.map(function (it, i) {
				var fSent = parseFloat(it.SentQuantity || 0);
				var fRecvd = parseFloat(it.RecievedQuantity || 0);
				var fRate = parseFloat(it.ItemNetPrice || 0);
				var fTotal = parseFloat(it.Totalvalue || (fSent * fRate).toFixed(2));
				return {
					sno: i + 1,
					ItemNo: it.ItemNo || "",
					Material: it.Material || "",
					HSNCode: it.HSNCode || "",
					HSNDesc: it.HSNDesc || "",
					UOM: it.UOM || "",
					ItemNetPrice: fRate,
					SentQuantity: fSent,
					RecievedQuantity: fRecvd,
					BalanceQuantity: parseFloat((fSent - fRecvd).toFixed(3)),
					Totalvalue: fTotal,
					Remarks: it.Remarks || ""
				};
			});

			oModel.setProperty("/items", aMapped);

			var fTotal = aMapped.reduce(function (s, it) { return s + parseFloat(it.Totalvalue || 0); }, 0);
			oModel.setProperty("/FinalTotal", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		onRecievedQuantityInputLiveChange: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("nrgp");
			var oItem = oCtx.getObject();
			var oModel = this.getView().getModel("nrgp");

			var fSent = parseFloat(oItem.SentQuantity || 0);
			var fRecvd = parseFloat(oItem.RecievedQuantity || 0);
			var fRate = parseFloat(oItem.ItemNetPrice || 0);

			oItem.BalanceQuantity = parseFloat((fSent - fRecvd).toFixed(3));
			oItem.Totalvalue = parseFloat((fSent * fRate).toFixed(2));

			oModel.refresh(true);
			this._recalcTotal();
		},

		_recalcTotal: function () {
			var oModel = this.getView().getModel("nrgp");
			var aItems = oModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (s, it) { return s + parseFloat(it.Totalvalue || 0); }, 0);
			oModel.setProperty("/FinalTotal", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		},

		onSelectStatusChange: function () {
			var oModel = this.getView().getModel("nrgp");
			oModel.setProperty("/StatusState", this._getStatusState(oModel.getProperty("/GPStatus")));
		},

		onAddCommentButtonPress: function () {
			var oModel = this.getView().getModel("nrgp");
			var aComments = oModel.getProperty("/CommentsList") || [];
			var sDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).split("/").join("-");
			aComments.push({ text: "", date: sDate });
			oModel.setProperty("/CommentsList", aComments);
			oModel.refresh(true);
		},

		onButtonDeleteCommentPress: function (oEvent) {
			var oItem = oEvent.getSource().getParent();
			var iIndex = oItem.getParent().indexOfItem(oItem);
			var oModel = this.getView().getModel("nrgp");
			var aComments = oModel.getProperty("/CommentsList");
			aComments.splice(iIndex, 1);
			oModel.setProperty("/CommentsList", aComments);
			oModel.refresh(true);
		},

		onSAVEButtonPress: function () {
			var oData = this.getView().getModel("nrgp").getData();
			var oODataModel = this.getOwnerComponent().getModel();

			if (!oODataModel) {
				MessageBox.warning("Backend service not available.");
				return;
			}

			var sToday = new Date().toISOString().split("T")[0];
			var sChallanDate = oData.ChallanDate ? new Date(oData.ChallanDate).toISOString().split("T")[0] : sToday;

			var oPayload = {
				GatePassreqNo: oData.GatePassreqNo || "",
				FiscalYear: oData.FiscalYear || String(new Date().getFullYear()),
				Plant: oData.Plant || "",
				GatePassNo: oData.GatePassNo || "",
				Vendor: oData.Vendor || "",
				VendorName: "",
				VendorGST: oData.VendorGST || "",
				VendorPerson: oData.VendorPerson || "",
				ZipCode: oData.ZipCode || "",
				City: oData.City || "",
				GatePassDate: sToday,
				PurchasingDoc: oData.PurchasingDoc || "",
				ChallanDate: sChallanDate,
				GateEntryNo: oData.GateEntryNo || "",
				NoOfPacakages: parseInt(oData.NoOfPacakages || 0),
				Department: oData.Department || "",
				ChallanNumber: oData.ChallanNumber || "",
				GatePassType: "NRGP",
				VehicleNo: oData.VehicleNo || "",
				ModeOfDispatch: oData.ModeOfTransport || "",
				Remarks: oData.Remarks || "",
				GPStatus: oData.GPStatus || "",
				Message: "",
				OutgateNav: (oData.items || []).map(function (it, i) {
					return {
						GatePassType: "NRGP",
						GatePassNo: oData.GatePassNo || "",
						ItemNo: it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						Material: it.Material || "",
						HSNCode: it.HSNCode || "",
						HSNDesc: it.HSNDesc || "",
						UOM: it.UOM || "",
						ItemNetPrice: String(parseFloat(it.ItemNetPrice || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.SentQuantity || 0).toFixed(3)),
						RecievedQuantity: String(parseFloat(it.RecievedQuantity || 0).toFixed(3)),
						BalanceQuantity: String(parseFloat(it.BalanceQuantity || 0).toFixed(3)),
						Totalvalue: String(parseFloat(it.Totalvalue || 0).toFixed(2)),
						GatePassReqNo: oData.GatePassreqNo || "",
						Remarks: it.Remarks || ""
					};
				})
			};

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function (oResponse) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = oResponse.Message || "Gate Pass updated successfully!";
					MessageBox.success(sMsg);
					var oModel = this.getView().getModel("nrgp");
					oModel.setProperty("/StatusState", this._getStatusState(oData.GPStatus));
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error saving Gate Pass.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) { /* ignore */ }
					MessageBox.error(sMsg);
				}
			});
		},

		onButtonNavBackPress: function () {
			this.getRouter().navTo("NRGPList");
		},

		onPRINTGATEPASSButtonPress: async function () {
			var oOut = this.getView().getModel("nrgp").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF("l", "mm", "a4");
			var pageWidth = doc.internal.pageSize.width;
			var pageHeight = doc.internal.pageSize.height;
			var margin = 12;
			var contentWidth = pageWidth - margin * 2;
			var sDate = oOut.GatePassDate || new Date().toLocaleDateString("en-GB").split("/").join("-");
			var fTotal = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, "") : "0") || 0;

			doc.setLineWidth(0.6);
			doc.rect(7, 5, pageWidth - 14, pageHeight - 10);
			doc.setLineWidth(0.2);
			doc.rect(8.5, 6.5, pageWidth - 17, pageHeight - 13);

			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, "PNG", margin, 9, 32, 12);
			} catch (e) { /* logo optional */ }

			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(14);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
			doc.setFont("helvetica", "normal");
			doc.setFontSize(7.5);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });

			doc.setFontSize(8.5);
			doc.setFont("helvetica", "bold");
			doc.text("GP No : " + (oOut.GatePassNo || ""), pageWidth - margin, 12, { align: "right" });
			doc.setFont("helvetica", "normal");
			doc.text("Date : " + sDate, pageWidth - margin, 17, { align: "right" });

			doc.setLineWidth(0.5);
			doc.line(margin, 30.5, pageWidth - margin, 30.5);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(11);
			doc.text("NON-RETURNABLE GATE PASS", pageWidth / 2, 37, { align: "center" });
			var titleW = doc.getTextWidth("NON-RETURNABLE GATE PASS");
			doc.setLineWidth(0.35);
			doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

			var gridY = 41, gridH = 32;
			var lColW = 148;
			var lColX = margin, rColX = margin + lColW;
			var pad = 3, rLH = 5.5;

			doc.setLineWidth(0.3);
			doc.rect(lColX, gridY, contentWidth, gridH);
			doc.line(rColX, gridY, rColX, gridY + gridH);
			doc.setLineWidth(0.2);
			doc.line(lColX, gridY + 9, rColX, gridY + 9);

			doc.setFontSize(8.5);
			doc.setFont("helvetica", "normal");
			doc.text("Please allow", lColX + pad, gridY + 6);
			doc.setFont("helvetica", "bold");
			doc.text(oOut.VendorPerson || "Mr./Ms.", lColX + 34, gridY + 6);
			doc.setFont("helvetica", "normal");
			var splitAddr = doc.splitTextToSize(oOut.VendorAddress || oOut.City || "", lColW - pad * 2 - 2);
			doc.text(splitAddr, lColX + pad, gridY + 14);
			doc.setFont("helvetica", "italic");
			doc.setFontSize(8);
			doc.text("to take out the following material from MEIL premises.", lColX + pad, gridY + gridH - 3.5);

			var rc = rColX + pad, ry = gridY + 6, lblOff = 30;
			doc.setFontSize(8.5);
			doc.setFont("helvetica", "bold"); doc.text("Req. No:", rc, ry);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassreqNo || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold"); doc.text("GP Type:", rc, ry);
			doc.setFont("helvetica", "normal"); doc.text("NRGP", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold"); doc.text("Department:", rc, ry);
			doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", rc, ry);
			doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", rc + lblOff, ry); ry += rLH;
			doc.setFont("helvetica", "bold"); doc.text("Vendor GST:", rc, ry);
			doc.setFont("helvetica", "normal"); doc.text(oOut.VendorGST || "", rc + lblOff, ry);

			var tableData = (oOut.items || []).map(function (it, i) {
				return [
					i + 1,
					it.Material || "",
					it.HSNCode || "",
					parseFloat(it.SentQuantity || 0).toLocaleString("en-IN", { minimumFractionDigits: 3 }),
					it.UOM || "",
					parseFloat(it.ItemNetPrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
					parseFloat(it.Totalvalue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
				];
			});
			while (tableData.length < 6) { tableData.push(["", "", "", "", "", "", ""]); }

			doc.autoTable({
				startY: gridY + gridH + 1,
				head: [["S.No", "DESCRIPTION OF GOODS", "HSN Code", "Outward QTY", "UOM", "Rate (Rs.)", "Value (Rs.)"]],
				body: tableData,
				theme: "grid",
				headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8.5, halign: "center", valign: "middle", cellPadding: 3, lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 }, lineColor: [0, 0, 0], lineWidth: 0.25, valign: "middle" },
				columnStyles: { 0: { cellWidth: 14, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 26, halign: "center" }, 3: { cellWidth: 30, halign: "right" }, 4: { cellWidth: 18, halign: "center" }, 5: { cellWidth: 30, halign: "right" }, 6: { cellWidth: 34, halign: "right" } },
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;
			var footH = 9, totalColW = 64;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, footH);
			doc.line(pageWidth - margin - totalColW, finalY, pageWidth - margin - totalColW, finalY + footH);
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			doc.text("In Words :  Rupees " + this._numberToWords(Math.round(fTotal)) + " Only.", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "bold");
			doc.text("Total Value (Rs.)", pageWidth - margin - totalColW + 3, finalY + 5.5);
			doc.text(fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 }), pageWidth - margin - 3, finalY + 5.5, { align: "right" });

			var remY = finalY + footH + 1, remH = 8;
			doc.setLineWidth(0.25);
			doc.rect(margin, remY, contentWidth, remH);
			doc.line(margin + 28, remY, margin + 28, remY + remH);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Remarks:", margin + 3, remY + 5);
			doc.setFont("helvetica", "normal");
			doc.text(doc.splitTextToSize(oOut.Remarks || "NIL", contentWidth - 33), margin + 31, remY + 5);

			var sigY = remY + remH + 20;
			var sigLineW = 52;
			var sigGap = (contentWidth - sigLineW * 4) / 3;
			var sigPositions = [margin, margin + sigLineW + sigGap, margin + (sigLineW + sigGap) * 2, margin + (sigLineW + sigGap) * 3];
			var sigLabels = ["Requested By", "HOD Approval", "Store In-Charge", "Security / Gate"];
			doc.setLineWidth(0.3);
			sigPositions.forEach(function (sx) { doc.line(sx, sigY, sx + sigLineW, sigY); });
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			sigPositions.forEach(function (sx, i) { doc.text(sigLabels[i], sx + sigLineW / 2, sigY + 5, { align: "center" }); });

			doc.save("GatePass_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Gate Pass Printed");
		},

		onGenerateDCButtonPress: async function () {
			var oOut = this.getView().getModel("nrgp").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF("p", "mm", "a4");
			var margin = 15;
			var pageWidth = doc.internal.pageSize.width;
			var pageHeight = doc.internal.pageSize.height;
			var contentWidth = pageWidth - margin * 2;
			var sDate = new Date().toLocaleDateString("en-GB").split("/").join("-");

			doc.setLineWidth(0.6);
			doc.rect(8, 6, pageWidth - 16, pageHeight - 12);
			doc.setLineWidth(0.2);
			doc.rect(9.5, 7.5, pageWidth - 19, pageHeight - 15);

			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, "PNG", margin, 10, 30, 11);
			} catch (e) { /* logo optional */ }

			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "bold"); doc.setFontSize(13);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
			doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });
			doc.setLineWidth(0.5);
			doc.line(margin, 30.5, pageWidth - margin, 30.5);

			doc.setFont("helvetica", "bold"); doc.setFontSize(11);
			doc.text("DELIVERY CHALLAN", pageWidth / 2, 37, { align: "center" });
			var titleW = doc.getTextWidth("DELIVERY CHALLAN");
			doc.setLineWidth(0.35);
			doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

			var gridY = 41, gridH = 50;
			var col1W = 62, col2W = 65;
			var col1X = margin, col2X = margin + col1W, col3X = margin + col1W + col2W;
			var pad = 3, lh = 5.5;

			doc.setLineWidth(0.3);
			doc.rect(col1X, gridY, contentWidth, gridH);
			doc.line(col2X, gridY, col2X, gridY + gridH);
			doc.line(col3X, gridY, col3X, gridY + gridH);

			doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
			doc.text("To", col1X + pad, gridY + 8);
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			var splitAddr = doc.splitTextToSize(oOut.VendorAddress || oOut.City || "", col1W - 14);
			doc.text(splitAddr, col1X + 10, gridY + 14);
			doc.setLineWidth(0.2);
			doc.line(col1X, gridY + gridH - 10, col2X, gridY + gridH - 10);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("GST No:", col1X + pad, gridY + gridH - 4);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.VendorGST || "", col1X + 22, gridY + gridH - 4);

			var c2 = col2X + pad, valOff2 = 30, y2 = gridY + 8;
			doc.setFontSize(8);
			doc.setFont("helvetica", "bold"); doc.text("DC No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || "Draft", c2 + valOff2, y2); y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("DC Date:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(sDate, c2 + valOff2, y2); y2 += lh + 2;
			doc.setFont("helvetica", "bold"); doc.text("Mode Of Transport:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ModeOfTransport || "By Road", c2 + valOff2, y2); y2 += lh + 2;
			doc.setFont("helvetica", "bold"); doc.text("LR/Vehicle No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", c2 + valOff2, y2);

			var c3 = col3X + pad, valOff3 = 27, y3 = gridY + 8;
			doc.setFontSize(8);
			doc.setFont("helvetica", "bold"); doc.text("GP No:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassNo || "", c3 + valOff3, y3); y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("GP Date:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassDate || sDate, c3 + valOff3, y3); y3 += lh + 2;
			doc.setFont("helvetica", "bold"); doc.text("Dept:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", c3 + valOff3, y3);

			var tableData = (oOut.items || []).map(function (item, index) {
				return [
					index + 1,
					item.Material || "",
					item.HSNCode || "",
					item.UOM || "",
					parseFloat(item.SentQuantity || 0).toLocaleString("en-IN", { minimumFractionDigits: 3 }),
					parseFloat(item.ItemNetPrice || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
					parseFloat(item.Totalvalue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })
				];
			});

			doc.autoTable({
				startY: gridY + gridH + 1,
				head: [["S.No", "DESCRIPTION", "HSN Code", "UOM", "QTY", "Rate", "Amt (In Rs.)"]],
				body: tableData,
				theme: "grid",
				headStyles: { fillColor: [235, 235, 235], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 8, halign: "center", valign: "middle", cellPadding: 3, lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { fontSize: 8, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 }, lineColor: [0, 0, 0], lineWidth: 0.25, valign: "middle" },
				columnStyles: { 0: { cellWidth: 12, halign: "center" }, 1: { cellWidth: "auto" }, 2: { cellWidth: 25, halign: "center" }, 3: { cellWidth: 16, halign: "center" }, 4: { cellWidth: 20, halign: "right" }, 5: { cellWidth: 22, halign: "right" }, 6: { cellWidth: 27, halign: "right" } },
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;
			var fTotalNum = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, "") : "0") || 0;
			var footH = 9, totalColW = 49;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, footH);
			doc.line(pageWidth - margin - totalColW, finalY, pageWidth - margin - totalColW, finalY + footH);
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			doc.text("In Words :  Rupees " + this._numberToWords(Math.round(fTotalNum)) + " Only.", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "bold");
			doc.text("Total", pageWidth - margin - totalColW + 3, finalY + 5.5);
			doc.text(fTotalNum.toLocaleString("en-IN", { minimumFractionDigits: 2 }), pageWidth - margin - 3, finalY + 5.5, { align: "right" });

			var noteY = finalY + footH + 3;
			var noteText = oOut.DCNotes || "Empty cylinders return to the vendor and there is no sale in this transaction.";
			var splitNote = doc.splitTextToSize(noteText, contentWidth - 22);
			var noteH = Math.max(10, splitNote.length * 5 + 6);
			doc.setLineWidth(0.25);
			doc.rect(margin, noteY, contentWidth, noteH);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Note :", margin + 3, noteY + 6);
			doc.setFont("helvetica", "normal");
			doc.text(splitNote, margin + 18, noteY + 6);

			var sigY = noteY + noteH + 22;
			var sigLineW = 48;
			doc.setLineWidth(0.3);
			doc.line(margin, sigY, margin + sigLineW, sigY);
			doc.line(pageWidth / 2 - sigLineW / 2, sigY, pageWidth / 2 + sigLineW / 2, sigY);
			doc.line(pageWidth - margin - sigLineW, sigY, pageWidth - margin, sigY);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Prepared By", margin + sigLineW / 2, sigY + 5, { align: "center" });
			doc.text("Store In-Charge", pageWidth / 2, sigY + 5, { align: "center" });
			doc.text("Authorised Signatory", pageWidth - margin - sigLineW / 2, sigY + 5, { align: "center" });

			doc.save("DC_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Delivery Challan Downloaded");
		},

		_numberToWords: function (num) {
			var a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
			var b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
			if ((num = num.toString()).length > 9) return "overflow";
			var n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) return "";
			var str = "";
			str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore " : "";
			str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh " : "";
			str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand " : "";
			str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred " : "";
			str += (n[5] != 0) ? ((str !== "") ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : "";
			return str;
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image();
				img.crossOrigin = "Anonymous";
				img.onload = function () {
					var canvas = document.createElement("canvas");
					canvas.width = img.width;
					canvas.height = img.height;
					canvas.getContext("2d").drawImage(img, 0, 0);
					resolve(canvas.toDataURL("image/png"));
				};
				img.onerror = reject;
				img.src = url;
			});
		}

	});
});
