sap.ui.define([
	"zgpms/meilpower/com/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.OutGatePass", {

		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("OutGatePass").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._resetModel();
		},

		onAddComment: function () {
			var oOutModel = this.getView().getModel("out");
			var aComments = oOutModel.getProperty("/CommentsList") || [];
			var sDate = new Date().toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric"
			}).split("/").join("-");

			aComments.push({
				text: "",
				date: sDate
			});
			oOutModel.setProperty("/CommentsList", aComments);
			oOutModel.refresh(true);
		},

		onDeleteComment: function (oEvent) {
			var oItem = oEvent.getSource().getParent();
			var oTable = oItem.getParent();
			var iIndex = oTable.indexOfItem(oItem);

			var oOutModel = this.getView().getModel("out");
			var aComments = oOutModel.getProperty("/CommentsList");
			aComments.splice(iIndex, 1);
			oOutModel.setProperty("/CommentsList", aComments);
			oOutModel.refresh(true);
		},
		onQuantityChange: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("out").getObject();
			var oOutModel = this.getView().getModel("out");

			var fSent = parseFloat(oItem.sentQty || 0);
			var fRecvd = parseFloat(oItem.recvdQty || 0);
			var fRate = parseFloat(oItem.rate || 0);

			// Update Balance with precision rounding
			oItem.balQty = parseFloat((fSent - fRecvd).toFixed(3));

			// Update Amount with precision rounding
			oItem.amount = parseFloat((fSent * fRate).toFixed(3));

			oOutModel.refresh(true);
			this._calculateFinalTotal();
		},

		_calculateFinalTotal: function () {
			var oOutModel = this.getView().getModel("out");
			var aItems = oOutModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (sum, item) {
				return sum + parseFloat(item.amount || 0);
			}, 0);
			oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));
		},

		_resetModel: function () {
			var oData = {
				GatePassreqNo: "",
				GatePassNo: "",
				Requestor: "",
				Department: "",
				VendorName: "",
				VendorGST: "",
				VendorAddress: "",
				UserRemarks: "",
				items: [],
				FinalTotal: "0.00",
				showLogistics: false,
				DocOptionIndex: 0,
				Status: "OPEN",
				CommentsList: [],
				TransporterName: "",
				TransporterGST: "",
				DCNotes: "",
				InsuranceRequired: false,
				VehicleNo: "",
				ModeOfTransport: "Road",
				TransportByIndex: 1,
				NoOfPackages: 0,
				ChallanNumber: "",
				ChallanDate: null,
				GateEntryNo: "",
				Plant: "",
				ExtendedReturnableDate: null,
				Cocode: ""
			};
			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "out");
		},

		onSearchRequest: function (oEvent) {
			var sReqNo = "";
			if (oEvent.getParameter("selectedItem")) {
				sReqNo = oEvent.getParameter("selectedItem").getKey();
			} else if (oEvent.getParameter("query")) {
				sReqNo = oEvent.getParameter("query");
			} else {
				return;
			}

			if (!sReqNo) {
				MessageBox.error("Request number not found");
				return;
				
			}

			var oODataModel = this.getOwnerComponent().getModel();
			this._resetModel(); // Clear existing
			if (!oODataModel) {
				MessageBox.error("Backend OData service not connected.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			// Use Filter because the entity has a composite key
			var aFilters = [
				new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo)
			];

			// Try reading from OutGatePassSet first
			oODataModel.read("/GateReqHdrSet", {
				filters: aFilters,
				urlParameters: {
					"$expand": "GateReqItmNav"
				},
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oResult = oData.results && oData.results[0];

					if (oResult) {
						var sStatus = oResult.ApprovalReq.toUpperCase();
						// console.log("oResult:", oResult);
						// console.log("Approval Status:", sStatus);
						if (sStatus === "A") {
							console.log('approve ayindi')
							this._validateAndMapData(oResult);
						} else if(sStatus === "R") {
							console.log('This Gate pass is number Regected')
							sap.m.MessageBox.warning(
								"Request Number " + sReqNo + " is Regected!"
							);
						}
						else if(sStatus === "P") {
						console.log(sReqNo,"This is number is in pending")
						sap.m.MessageBox.error("Request Number " + sReqNo + " is waiting for Approval.");
					} 
					}
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					sap.m.MessageBox.error("Error fetching request " + sReqNo);
				}.bind(this)
			});
		},

		onNextSection: function (oEvent) {
			var oOutModel = this.getView().getModel("out");

			// Show the logistics section
			oOutModel.setProperty("/showLogistics", true);

			// Wait for UI to render then scroll
			setTimeout(function () {
				var oVBox = this.getView().byId("outGatePassPage").getContent()[0];
				var aItems = oVBox.getItems();
				// The Logistics panel is the one with visible binding
				var oLogistics = aItems.find(function (item) {
					return item.getMetadata().getName() === "sap.m.Panel" && item.getHeaderText() === "LOGISTICS & DOCUMENTS";
				});

				if (oLogistics && oLogistics.getDomRef()) {
					oLogistics.getDomRef().scrollIntoView({ behavior: "smooth", block: "start" });
				}
			}.bind(this), 100);
		},

		_validateAndMapData: function (oData) {
			var oOutModel = this.getView().getModel("out");

			// Auto-detect navigation property
			var aItems = [];
			if (oData.OutgateNav && oData.OutgateNav.results) {
				aItems = oData.OutgateNav.results;
			} else if (oData.GateReqItmNav && oData.GateReqItmNav.results) {
				aItems = oData.GateReqItmNav.results;
			}
			// Mapping from OutGatePassSet sample payload
			oOutModel.setProperty("/GatePassreqNo", oData.GatePassReqNo || oData.GatePassreqNo);
			var sRawStatus = oData.ApprovalReq || oData.ApprovalReq || oData.Status || oData.ApprovalStatus || oData.Approvalstatus || oData.Zstatus || oData.Zgpstatus || oData.Stat || oData.ZGP_STATUS || oData.ZSTATUS || "";
			var sStatus = "PENDING";
			if (sRawStatus === "APPROVED" || sRawStatus === "A" || sRawStatus === "Approved" || sRawStatus === "RELEASED") {
				sStatus = "APPROVED";
			} else if (sRawStatus === "REJECTED" || sRawStatus === "R" || sRawStatus === "Rejected") {
				sStatus = "REJECTED";
			} else if (sRawStatus) {
				sStatus = sRawStatus;
			}
			oOutModel.setProperty("/ApprovalStatus", sStatus);

			// Set state and icon based on status
			var sState = "Warning";
			var sIcon = "sap-icon://alert";
			if (sStatus === "APPROVED") {
				sState = "Success";
				sIcon = "sap-icon://sys-enter-2";
			} else if (sStatus === "REJECTED") {
				sState = "Error";
				sIcon = "sap-icon://sys-cancel-2";
			}
			oOutModel.setProperty("/ApprovalState", sState);
			oOutModel.setProperty("/ApprovalIcon", sIcon);
			oOutModel.setProperty("/GatePassNo", oData.GatePassNo || "");
			oOutModel.setProperty("/GatePassType", oData.GatePassType || "");
			oOutModel.setProperty("/Requestor", oData.Requestor || "");
			oOutModel.setProperty("/Department", oData.Department);
			oOutModel.setProperty("/VendorName", oData.VendorName);
			oOutModel.setProperty("/VendorGST", oData.VendorGST);
			oOutModel.setProperty("/TransporterName", oData.VendorName || "");
			oOutModel.setProperty("/TransporterGST", oData.VendorGST || "");
			oOutModel.setProperty("/VendorAddress", (oData.City || "") + ", " + (oData.ZipCode || ""));
			oOutModel.setProperty("/VendorPerson", oData.VendorPerson);
			oOutModel.setProperty("/UserRemarks", oData.Remarks);
			oOutModel.setProperty("/VehicleNo", oData.VehicleNo);
			oOutModel.setProperty("/ModeOfTransport", oData.ModeOfDispatch);
			oOutModel.setProperty("/Plant", oData.Plant || oData.Werks || "");
			oOutModel.setProperty("/Cocode", oData.Bukrs || oData.BUKRS || oData.Cocode || oData.CoCode || oData.CompanyCode || "");

			// Detect items from different potential navigation properties
			var aItems = [];
			if (oData.OutgateNav) {
				aItems = oData.OutgateNav.results || (Array.isArray(oData.OutgateNav) ? oData.OutgateNav : []);
			} else if (oData.GateReqItmNav) {
				aItems = oData.GateReqItmNav.results || (Array.isArray(oData.GateReqItmNav) ? oData.GateReqItmNav : []);
			} else if (oData.GateReqItemNav) {
				aItems = oData.GateReqItemNav.results || (Array.isArray(oData.GateReqItemNav) ? oData.GateReqItemNav : []);
			}

			var aMappedItems = aItems.map(function (it, index) {
				// Handle field name variations across different sets
				var fQty = parseFloat(it.RequestedQuantity || it.Quantity || it.Menge || it.RequestedQty || it.Requestedqty || it.Qty || 0);
				var fRate = parseFloat(it.ItemNetPrice || it.Rate || it.Netpr || it.NetPrice || 0);
				var fTotal = parseFloat(it.Totalvalue || it.TotalValue || it.Netwr || (fQty * fRate));

				return {
					sno: index + 1,
					materialName: it.Material || it.Matnr || "",
					hsnCode: it.HSNCode || it.Hsncode || "",
					sentQty: fQty,
					recvdQty: 0,
					balQty: fQty,
					uom: it.UOM || it.Uom || it.Meins || "EA",
					rate: fRate,
					amount: fTotal
				};
			});
			oOutModel.setProperty("/items", aMappedItems);

			// Recalc Total
			var fTotal = aMappedItems.reduce(function (sum, it) { return sum + it.amount; }, 0);
			oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
		},



		onNavHome: function () {
			this.getRouter().navTo("home");
		},

		onGenerateDC: async function () {
			var oOut = this.getView().getModel("out").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('p', 'mm', 'a4');
			var margin = 10;
			var pageWidth = doc.internal.pageSize.width;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// --- 1. Header Section ---
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 5, 25, 9);
			} catch (e) {
				console.error("Logo load failed", e);
			}
			doc.setFont("helvetica", "bold"); doc.setFontSize(14);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 10, { align: "center" });
			doc.setFontSize(7); doc.setFont("helvetica", "normal");
			doc.text("(Formerly TAGA Neyveli Power Company Private Limited)", pageWidth / 2, 13, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 16, { align: "center" });
			doc.text("Tel : +91-4142-270300 | Fax : +91-4142-270401", pageWidth / 2, 19, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV | CIN : U40109TN1993PTC026223", pageWidth / 2, 22, { align: "center" });

			doc.setFontSize(11);
			doc.text("DELIVERY CHALLAN", pageWidth / 2, 30, { align: "center" });
			doc.line(pageWidth / 2 - 20, 31, pageWidth / 2 + 20, 31);

			// --- 2. Unified Grid Section ---
			var hY = 35;
			doc.setLineWidth(0.1);
			doc.rect(margin, hY, pageWidth - margin * 2, 45); // Outer Box
			doc.line(75, hY, 75, hY + 45); // Vertical 1
			doc.line(135, hY, 135, hY + 45); // Vertical 2

			// Column 1: To Address
			doc.setFontSize(8); doc.setFont("helvetica", "bold");
			doc.text("To", margin + 2, hY + 5);
			doc.text(oOut.VendorName || "", margin + 10, hY + 5);
			doc.setFont("helvetica", "normal");
			var splitToAddr = doc.splitTextToSize(oOut.VendorAddress || "", 55);
			doc.text(splitToAddr, margin + 10, hY + 10);
			doc.setFont("helvetica", "bold");
			doc.text("GST No", margin + 2, hY + 40);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.VendorGST || "", margin + 12, hY + 40);

			// Column 2: DC & Transport
			var c2X = 77;
			doc.setFont("helvetica", "bold"); doc.text("DC No:", c2X, hY + 5);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || "Draft", c2X + 28, hY + 5);
			doc.setFont("helvetica", "bold"); doc.text("DC Date:", c2X, hY + 10);
			doc.setFont("helvetica", "normal"); doc.text(sDate, c2X + 28, hY + 10);

			doc.setFont("helvetica", "bold"); doc.text("Mode Of Transport:", c2X, hY + 18);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ModeOfTransport || "By Road", c2X + 28, hY + 18);

			doc.setFont("helvetica", "bold");
			doc.text("LR/Vehicle No/", c2X, hY + 26);
			doc.text("Transporter Name:", c2X, hY + 30);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.VehicleNo || "", c2X + 28, hY + 26);
			var splitTrans = doc.splitTextToSize(oOut.TransporterName || "Self", 40);
			doc.text(splitTrans, c2X + 28, hY + 30);

			// Column 3: GP & Location
			var c3X = 137;
			doc.setFont("helvetica", "bold"); doc.text("GP No", c3X, hY + 5);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassNo || "", c3X + 28, hY + 5);
			doc.setFont("helvetica", "bold"); doc.text("GP Date:", c3X, hY + 10);
			doc.setFont("helvetica", "normal"); doc.text(sDate, c3X + 28, hY + 10);

			doc.setFont("helvetica", "bold"); doc.text("Despatch From:", c3X, hY + 18);
			doc.setFont("helvetica", "normal"); doc.text("Uthangal, Neyveli", c3X + 28, hY + 18);
			doc.setFont("helvetica", "bold"); doc.text("Despatch To:", c3X, hY + 26);
			doc.setFont("helvetica", "normal"); doc.text(oOut.City || "Neyveli", c3X + 28, hY + 26);
			doc.setFont("helvetica", "bold"); doc.text("EWBNo:", c3X, hY + 34);
			doc.setFont("helvetica", "normal"); doc.text(oOut.EWayBillNo || "", c3X + 28, hY + 34);

			// --- 3. Items Table ---
			var tableData = (oOut.items || []).map(function (item, index) {
				return [index + 1, item.materialName, item.hsnCode, item.uom, item.sentQty, parseFloat(item.rate || 0).toFixed(2), parseFloat(item.amount || 0).toFixed(2)];
			});

			doc.autoTable({
				startY: hY + 48,
				head: [['S.N o', 'DESCRIPTION', 'HSN Code', 'UOM', 'QTY', 'Rate', 'Amt(In Rs.)']],
				body: tableData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1, halign: 'center' },
				styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
				columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 15, halign: 'center' }, 4: { cellWidth: 15, halign: 'center' }, 5: { cellWidth: 20, halign: 'right' }, 6: { cellWidth: 25, halign: 'right' } }
			});

			var finalY = doc.lastAutoTable.finalY;
			var fTotal = oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0";
			var totalAmt = parseFloat(fTotal);

			// Table Footer Row (In Words & Total)
			doc.rect(margin, finalY, pageWidth - margin * 2, 8);
			doc.setFontSize(8); doc.setFont("helvetica", "normal");
			doc.text("In Words - Rupees " + this._numberToWords(Math.round(totalAmt)) + " Only.", margin + 2, finalY + 5);
			doc.line(pageWidth - 60, finalY, pageWidth - 60, finalY + 8);
			doc.setFont("helvetica", "bold"); doc.text("Total", pageWidth - 55, finalY + 5);
			doc.text(totalAmt.toLocaleString(), pageWidth - margin - 2, finalY + 5, { align: "right" });

			// Note Section
			var y = finalY + 12;
			doc.rect(margin, y, pageWidth - margin * 2, 10);
			doc.setFont("helvetica", "bold"); doc.text("Note :", margin + 2, y + 6);
			doc.setFont("helvetica", "normal"); doc.text("Empty cylinders return to the vendor and there is no sale in this transaction.", margin + 12, y + 6);

			doc.save("DC_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Delivery Challan Downloaded");
		},

		onGenerateEWay: async function () {
			var oOut = this.getView().getModel("out").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('p', 'mm', 'a4');
			var margin = 10;
			var pageWidth = doc.internal.pageSize.width;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// --- Page 1 Header ---
			doc.setFont("helvetica", "bold"); doc.setFontSize(14);
			doc.text("e-Way Bill", pageWidth / 2, 15, { align: "center" });

			// QR Code Generation
			var sQRData = "E-Way Bill: " + (oOut.EWayBillNo || "N/A") + "\n" +
				"Gate Pass: " + (oOut.GatePassNo || "N/A") + "\n" +
				"Date: " + sDate + "\n" +
				"Vehicle: " + (oOut.VehicleNo || "N/A");
			try {
				var sQRBase64 = await this._getQRCodeBase64(sQRData);
				doc.addImage(sQRBase64, 'PNG', pageWidth - 42, 8, 30, 30);
			} catch (e) {
				doc.rect(pageWidth - 42, 8, 30, 30);
				doc.setFontSize(7); doc.text("QR ERROR", pageWidth - 27, 23, { align: "center" });
			}

			// --- 1. E-way Bill Details ---
			var y = 42;
			doc.setFontSize(9); doc.text("1- E-way Bill Details", margin, y);
			doc.line(margin, y + 1, pageWidth - margin, y + 1);
			y += 6;
			doc.setFontSize(7.5);
			doc.text("E-way Bill No: " + (oOut.EWayBillNo || ""), margin, y);
			doc.text("Generated Date: " + sDate + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 75, y);
			doc.text("Generated By: " + (oOut.Cocode || ""), 145, y);
			y += 5;
			doc.text("Mode: " + (oOut.ModeOfTransport || ""), margin, y);
			doc.text("Type: Outward - Others", 75, y);
			doc.text("Transaction Type: Regular", 145, y);
			doc.line(margin, y + 3, pageWidth - margin, y + 3);

			// --- 2. Address Details ---
			y += 10;
			doc.setFont("helvetica", "bold"); doc.text("2- Address Details", margin, y);
			y += 4;
			doc.rect(margin, y, 92, 30); doc.rect(108, y, 92, 30);
			doc.setFontSize(7); doc.text("From", margin + 1, y - 1); doc.text("To", 109, y - 1);
			doc.text("GSTIN : " + (oOut.CocodeGST || "33AACCS2753B1ZV"), margin + 2, y + 5);
			doc.text("MEIL NEYVELI ENERGY PRIVATE LIMITED", margin + 2, y + 10);
			doc.text("GSTIN : " + (oOut.VendorGST || ""), 110, y + 5);
			doc.text(oOut.VendorName || "", 110, y + 10);

			// --- 3. Goods Details ---
			y += 40;
			doc.setFont("helvetica", "bold"); doc.text("3- Goods Details", margin, y);
			var goodsData = (oOut.items || []).map(function (item) {
				return [item.hsnCode, item.materialName, item.sentQty + " " + item.uom, item.amount, "0.00+0.00+0.00+0.00=0.00"];
			});
			doc.autoTable({
				startY: y + 2,
				head: [['HSN Code', 'Product Name & Desc.', 'Quantity', 'Taxable Amt', 'Tax Rate']],
				body: goodsData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
				styles: { fontSize: 7, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1 }
			});

			// --- 4 & 5: Logistics ---
			y = doc.lastAutoTable.finalY + 10;
			doc.text("4- Transportation Details", margin, y);
			doc.line(margin, y + 1, pageWidth - margin, y + 1);
			doc.setFont("helvetica", "normal"); doc.text("Transporter: " + (oOut.TransporterName || "Self"), margin, y + 6);

			y += 15;
			doc.setFont("helvetica", "bold"); doc.text("5- Vehicle Details", margin, y);
			doc.autoTable({
				startY: y + 2,
				head: [['Mode', 'Vehicle No', 'From', 'Date', 'Entered By']],
				body: [['Road', oOut.VehicleNo || "", 'Neyveli', sDate, 'System']],
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
				styles: { fontSize: 7, cellPadding: 1.5 }
			});

			// --- Page 2: Certification ---
			doc.addPage();
			y = 40;
			doc.setFont("helvetica", "bold"); doc.setFontSize(12);
			doc.text("TO WHOMSOEVER IT MAY CONCERN", pageWidth / 2, y, { align: "center" });
			y += 15;
			doc.setFont("helvetica", "normal"); doc.setFontSize(10);
			var totalAmt = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0");
			var certText = "This is to certify that we are sending " + (oOut.items[0] ? oOut.items[0].materialName : "Materials") + " vide our " +
				(oOut.GatePassType || "Returnable") + " Gatepass No. " + (oOut.GatePassNo || "Draft") + " Dt. " + sDate + ", DC No. " + (oOut.ChallanNumber || "Draft") + " Dt. " + sDate +
				" from our " + (oOut.Plant || "") + " Power Plant to M/S. " + (oOut.VendorName || "") + ", " + (oOut.VendorAddress || "") + ". Through " + (oOut.VehicleNo || "") + "-" + (oOut.TransporterName || "Self") + ".";
			doc.text(doc.splitTextToSize(certText, pageWidth - 20), margin, y);
			doc.text("Value: Rs. " + totalAmt.toLocaleString() + "/- (" + this._numberToWords(Math.round(totalAmt)) + " Only)", margin, y + 30);

			doc.save("EWayBill_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("E-Way Bill Generated");
		},

		onPrintGatePass: async function () {
			var oOut = this.getView().getModel("out").getData();
			if (!oOut.GatePassNo) {
				MessageBox.warning("Please generate the Gate Pass first.");
				return;
			}

			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('p', 'mm', 'a4');
			var pageWidth = doc.internal.pageSize.width;
			var margin = 12;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// --- Header Section ---
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 10, 35, 12);
			} catch (e) {
				doc.setFont("helvetica", "bold");
				doc.setFontSize(22);
				doc.setTextColor(204, 32, 32);
				doc.text("MEIL", margin, 20);
			}
			
			doc.setFontSize(8);
			doc.setTextColor(0, 0, 0);

			// Company Info
			doc.setFontSize(16);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2 + 10, 18, { align: "center" });
			doc.setFontSize(7);
			doc.setFont("helvetica", "normal");
			doc.text("(Formerly TAGA Neyveli Power Company Private Limited)", pageWidth / 2 + 10, 22, { align: "center" });
			doc.text("250 MW LFPP, Uttangal, Neyveli, Tamilnadu - 607804, India", pageWidth / 2 + 10, 25, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV | CIN : U40109TN1993PTC026223", pageWidth / 2 + 10, 28, { align: "center" });

			// Title
			doc.setFontSize(10);
			doc.text("GATEPASS FOR NON RETURNABLE MATERIAL", pageWidth / 2, 38, { align: "center" });
			doc.line(pageWidth / 2 - 40, 39, pageWidth / 2 + 40, 39);

			// Ref & Date Row
			var y = 48;
			doc.setFontSize(9);
			doc.text(oOut.GatePassNo || "", margin, y);
			doc.text("GP Date:", 140, y);
			doc.setFont("helvetica", "normal");
			doc.text(sDate, 165, y);

			y += 5;
			doc.setFont("helvetica", "bold");
			doc.text("Vendor GST:", 140, y);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.VendorGST || "", 165, y);

			y += 5;
			doc.setFont("helvetica", "bold");
			doc.text("DC No:", 140, y);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.ChallanNumber || "N/A", 165, y);

			// Vendor Info
			y = 58;
			doc.setFontSize(8.5);
			doc.text("Please allow", margin, y);
			doc.setFont("helvetica", "bold");
			doc.text(oOut.VendorPerson || "Mr/Ms.", 35, y);
			y += 4;
			var vendorInfo = (oOut.VendorName || "") + ", " + (oOut.VendorAddress || "");
			var splitVendor = doc.splitTextToSize(vendorInfo, 100);
			doc.text(splitVendor, 35, y);

			y += (splitVendor.length * 4) + 2;
			doc.setFont("helvetica", "normal");
			doc.text("To take out the following material", margin, y);

			// --- Table ---
			y += 4;
			var tableData = (oOut.items || []).map(function (it, i) {
				return [i + 1, it.materialName || "", it.sentQty, it.uom, it.amount];
			});
			while (tableData.length < 8) { tableData.push(["", "", "", "", ""]); }

			doc.autoTable({
				startY: y,
				head: [['S.No', 'DESCRIPTION', 'Outward QTY', 'UOM', 'Material Value (Rs.)']],
				body: tableData,
				theme: 'grid',
				styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.1 },
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
				columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 95 }, 2: { cellWidth: 25 }, 3: { cellWidth: 20 }, 4: { cellWidth: 35, halign: 'right' } }
			});

			// --- Footer ---
			y = doc.lastAutoTable.finalY;
			doc.rect(margin, y, pageWidth - margin * 2, 8);
			doc.setFont("helvetica", "bold");
			doc.text("Remarks", margin + 2, y + 5);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.UserRemarks || "None", margin + 25, y + 5);

			y += 12;
			doc.setFontSize(8);
			doc.setFont("helvetica", "bold"); doc.text("Req No:", margin, y);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassreqNo || "", margin + 30, y);
			doc.setFont("helvetica", "bold"); doc.text("Req User:", 75, y);
			doc.setFont("helvetica", "normal"); doc.text(oOut.Requestor || "System", 95, y);
			doc.setFont("helvetica", "bold"); doc.text("Dept:", 140, y);
			doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", 155, y);

			y += 5;
			doc.setFont("helvetica", "bold"); doc.text("Approved By:", margin, y);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ApprovedBy || "Pending", margin + 30, y);
			doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", 75, y);
			doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", 95, y);
			doc.setFont("helvetica", "bold"); doc.text("Total Value (Rs.):", 140, y);
			doc.setFont("helvetica", "normal"); doc.text(oOut.FinalTotal || "0.00", 168, y);

			y += 5;
			var fTotal = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0");
			doc.setFont("helvetica", "italic");
			doc.text("(Rupees : " + this._numberToWords(Math.round(fTotal)) + " Only )", 140, y);

			// --- Signatures ---
			y += 25;
			doc.setFont("helvetica", "bold");
			doc.text("For MEIL Neyveli Energy Private Limited", margin, y);
			y += 12;
			doc.text("Authorised Signatory", margin, y);
			doc.text("Receiver's Sign", pageWidth - margin - 25, y, { align: "right" });

			doc.save("GatePass_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Gate Pass Generated");
		},



		_numberToWords: function (num) {
			var a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
			var b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

			if ((num = num.toString()).length > 9) return 'overflow';
			var n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
			if (!n) return '';
			var str = '';
			str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
			str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
			str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
			str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
			str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
			return str;
		},

		onDocOptionChange: function () {
			// Logic to show/hide document buttons handled via visibility bindings in XML
		},

		onSubmitOutgate: function () {
			var oOut = this.getView().getModel("out").getData();

			// Format today's date as YYYY-MM-DD
			var sToday = new Date().toISOString().split('T')[0];

			// Format Challan Date if exists, else today
			var sChallanDate = oOut.ChallanDate ?
				new Date(oOut.ChallanDate).toISOString().split('T')[0] : sToday;

			var oPayload = {
				GatePassreqNo: oOut.GatePassreqNo || "",
				FiscalYear: oOut.FiscalYear || String(new Date().getFullYear()),
				Plant: oOut.Plant || "",
				GatePassType: oOut.GatePassType || "RGP",
				GatePassNo: oOut.GatePassNo || "",
				Vendor: oOut.Vendor || "",
				VendorName: oOut.VendorName,
				VendorGST: oOut.VendorGST,
				VendorPerson: oOut.VendorPerson || "N/A",
				ZipCode: oOut.ZipCode || "",
				City: oOut.City || "",
				GatePassDate: sToday,
				PurchasingDoc: oOut.PurchasingDoc || "",
				ChallanDate: sChallanDate,
				GateEntryNo: oOut.GateEntryNo || "",
				NoOfPacakages: parseInt(oOut.NoOfPackages || 0),
				Department: oOut.Department,
				ChallanNumber: oOut.ChallanNumber || "",
				VehicleNo: oOut.VehicleNo,
				ModeOfDispatch: oOut.ModeOfTransport,
				Remarks: oOut.UserRemarks,
				GPStatus: oOut.Status || "",
				Message: "",

				"OutgateNav": (oOut.items || []).map(function (it, index) {
					return {
						GatePassType: oOut.GatePassType || "RGP",
						GatePassNo: oOut.GatePassNo || "",
						ItemNo: String((index + 1) * 10).padStart(5, '0'),
						Material: it.materialName,
						HSNCode: it.hsnCode,
						HSNDesc: it.materialDesc || "",
						UOM: it.uom,
						ItemNetPrice: String(parseFloat(it.rate || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.sentQty || 0).toFixed(3)),
						RecievedQuantity: String(parseFloat(it.recvdQty || 0).toFixed(3)),
						BalanceQuantity: String(parseFloat(it.balQty || 0).toFixed(3)),
						Totalvalue: String(parseFloat(it.amount || 0).toFixed(2)),
						GatePassReqNo: oOut.GatePassreqNo || "",
						Remarks: it.itemRemarks || ""
					};
				})
			};

			var oODataModel = this.getModel();
			if (!oODataModel) {
				MessageBox.warning("Backend service not available. Check console for payload.");
				console.log("Submit Payload:", oPayload);
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var sGPNo = oData.GatePassNo || "Generated";

					// Update model with generated GP No and show logistics
					var oOutModel = this.getView().getModel("out");
					oOutModel.setProperty("/GatePassNo", sGPNo);
					oOutModel.setProperty("/showLogistics", true);

					var sMsg = "Gate Pass " + sGPNo + " generated successfully!\n\nThe Logistics & Printing section is now active below.";
					
					MessageBox.success(sMsg, {
						actions: [MessageBox.Action.OK, "Copy GP Number"],
						emphasizedAction: MessageBox.Action.OK,
						onClose: function (sAction) {
							if (sAction === "Copy GP Number") {
								navigator.clipboard.writeText(sGPNo).then(function() {
									sap.m.MessageToast.show("Gate Pass Number " + sGPNo + " copied!");
								});
							}
						}
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error generating Gate Pass. Please check backend.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) { }
					MessageBox.error(sMsg);
				}
			});
		},

		onSaveLogistics: function () {
			var oOut = this.getView().getModel("out").getData();
			var oODataModel = this.getModel();

			if (!oOut.GatePassNo) {
				MessageBox.warning("Generate the Gate Pass first before saving logistics.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			// We use the same payload structure as generation but for update/save
			var oPayload = {
				GatePassreqNo: oOut.GatePassreqNo || "",
				GatePassNo: oOut.GatePassNo || "",
				VehicleNo: oOut.VehicleNo,
				ModeOfDispatch: oOut.ModeOfTransport,
				Remarks: oOut.UserRemarks,
				GPStatus: oOut.Status || "", // OPEN, CLOSE, ASSIGN
				// ... other fields as needed by backend
				"OutgateNav": (oOut.items || []).map(function (it, index) {
					return {
						GatePassNo: oOut.GatePassNo,
						ItemNo: String((index + 1) * 10).padStart(5, '0'),
						SentQuantity: String(it.sentQty),
						RecievedQuantity: String(it.recvdQty),
						BalanceQuantity: String(it.balQty),
						Remarks: it.itemRemarks || ""
					};
				})
			};

			// Note: If backend supports MERGE/PUT, use oODataModel.update
			// If it's a deep create for updates, use create. 
			// Assuming create for now as per typical Fiori patterns for deep entities.
			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = oData.Message || "Logistics details saved successfully!";
					MessageBox.success(sMsg);
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error saving logistics details.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) { }
					MessageBox.error(sMsg);
				}
			});
		},

		_getQRCodeBase64: function (sText) {
			return new Promise(function (resolve, reject) {
				try {
					var container = document.createElement("div");
					var qrcode = new QRCode(container, {
						text: sText,
						width: 256,
						height: 256
					});
					// Wait for it to render
					setTimeout(function () {
						var canvas = container.querySelector("canvas");
						if (canvas) {
							resolve(canvas.toDataURL("image/png"));
						} else {
							var img = container.querySelector("img");
							if (img && img.src) {
								resolve(img.src);
							} else {
								reject("Canvas not found");
							}
						}
					}, 100);
				} catch (e) {
					reject(e);
				}
			});
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image();
				img.crossOrigin = "Anonymous";
				img.onload = function () {
					var canvas = document.createElement('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					var ctx = canvas.getContext('2d');
					ctx.drawImage(img, 0, 0);
					resolve(canvas.toDataURL('image/png'));
				};
				img.onerror = function (err) {
					reject(err);
				};
				img.src = url;
			});
		},
	});
});
