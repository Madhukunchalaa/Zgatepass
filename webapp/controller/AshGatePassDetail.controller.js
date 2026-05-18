sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassDetail", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("AshGatePassDetail").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var sRequestId = decodeURIComponent(oEvent.getParameter("arguments").gpNo);
			this._loadDetail(sRequestId);
		},

		_loadDetail: function (sRequestId) {
			var aMockList = JSON.parse(localStorage.getItem("mockAshList") || "[]");
			var oData = aMockList.find(function(item) {
				return item.requestId === sRequestId;
			});

			if (!oData) {
				MessageBox.error("Request not found!");
				this.onNavBack();
				return;
			}

			// Parse date back if needed
			if (typeof oData.gpDate === "string") {
				oData.gpDate = new Date(oData.gpDate);
			}

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "ash");
		},

		onNavBack: function () {
			this.getRouter().navTo("AshGatePassList");
		},

		onVendorSelect: function (oEvent) {
			var oModel = this.getView().getModel("ash");
			var sKey = oEvent.getParameter("selectedItem").getKey();
			if (sKey === "V1") {
				oModel.setProperty("/vendorAddress", "Ramco Cement Ltd, Alathiyur Works, P.A.C. Ramaswamy Raja Nagar, Alathiyur, Ariyalur District, India");
				oModel.setProperty("/vendorGST", "33AABCM8375L2Z2");
			} else if (sKey === "V2") {
				oModel.setProperty("/vendorAddress", "123 Domestic Road, Chennai");
				oModel.setProperty("/vendorGST", "33XXXXXXXXXXXXX");
			}
		},

		onTransporterSelect: function (oEvent) {
			var oModel = this.getView().getModel("ash");
			var sKey = oEvent.getParameter("selectedItem").getKey();
			if (sKey === "T1") {
				oModel.setProperty("/TransporterGST", "33AEPP2875A2ZV");
			} else if (sKey === "T2") {
				oModel.setProperty("/TransporterGST", "33BBBBBBBBBBBB");
			}
		},

		calculateTotal: function () {
			var oModel = this.getView().getModel("ash");
			var aItems = oModel.getProperty("/items");
			
			var nTotal = 0;
			aItems.forEach(function(oItem, index) {
				var qty = parseFloat(oItem.quantity) || 0;
				var rate = parseFloat(oItem.rate) || 0;
				var amount = qty * rate;
				oModel.setProperty("/items/" + index + "/amount", amount.toFixed(2));
				nTotal += amount;
			});
			
			oModel.setProperty("/finalTotal", nTotal.toFixed(2));
		},

		onGenerateDC: function () {
			var oModel = this.getView().getModel("ash");
			oModel.setProperty("/dcGenerated", true);
			oModel.setProperty("/DCNumber", "DC/2024-25/0015"); // Mock DC No
			MessageToast.show("Delivery Challan Generated Successfully");
		},

		onComplete: function () {
			var oModel = this.getView().getModel("ash");
			var oData = oModel.getData();

			// Save to local storage
			var aMockList = JSON.parse(localStorage.getItem("mockAshList") || "[]");
			var iIndex = aMockList.findIndex(function(item) {
				return item.requestId === oData.requestId;
			});

			if (iIndex !== -1) {
				aMockList[iIndex] = oData;
				localStorage.setItem("mockAshList", JSON.stringify(aMockList));
				MessageToast.show("Request Saved Successfully");
				this.onNavBack();
			}
		},

		onPrint: async function () {
			var oModel = this.getView().getModel("ash");
			var oData = oModel.getData();

			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('l', 'mm', 'a4');
			var pageWidth = doc.internal.pageSize.width;
			var margin = 14;

			// Header Logo
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 10, 30, 11);
			} catch (e) {
				doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(180, 0, 0);
				doc.text("MEIL", margin, 18); doc.setTextColor(0, 0, 0);
			}

			// Header Text
			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "normal"); doc.setFontSize(16);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 14, { align: "center" });
			doc.setFontSize(8);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 19, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 23, { align: "center" });
			doc.text("GSTIN : 33AACCS2753B1ZV | CIN : U40109TN1993PTCO26223", pageWidth / 2, 27, { align: "center" });

			// Title
			doc.setFontSize(11);
			doc.setFont("helvetica", "bold");
			doc.text("NON-RETURNABLE GATE PASS FOR ASH", pageWidth / 2, 36, { align: "center" });
			var titleW = doc.getTextWidth("NON-RETURNABLE GATE PASS FOR ASH");
			doc.setLineWidth(0.3);
			doc.line(pageWidth / 2 - titleW / 2, 37.5, pageWidth / 2 + titleW / 2, 37.5);

			// Info Grid
			var y = 46;
			doc.setFontSize(9);
			doc.setFont("helvetica", "bold");
			doc.text(oData.requestId || "", margin, y);
			
			doc.setFont("helvetica", "normal");
			doc.text("Please allow", margin, y + 10);
			doc.text("The Manager,", margin + 30, y + 6);
			
			// Vendor Address wrapping
			var vendorDetails = (oData.vendorAddress || "");
			var splitVendor = doc.splitTextToSize(vendorDetails, 120);
			doc.text(splitVendor, margin + 30, y + 10);

			// Right side details
			var rightColX = 200;
			doc.text("GP Date:", rightColX, y);
			var gpDate = oData.gpDate ? new Date(oData.gpDate).toLocaleDateString('en-GB') : "";
			doc.text(gpDate, rightColX + 20, y);

			doc.text("Vendor GST:", rightColX, y + 6);
			doc.text(oData.vendorGST || "", rightColX + 20, y + 6);

			doc.text("DC No:", rightColX, y + 12);
			doc.text(oData.DCNumber || "", rightColX + 20, y + 12);

			y = y + 30;
			doc.setTextColor(0, 102, 204); // blueish text
			doc.text("To take out the following material", margin, y);
			doc.setTextColor(0, 0, 0);

			// Table
			y = y + 4;
			var tableData = [
				["1", oData.items[0].materialName || "Fly Ash", parseFloat(oData.items[0].quantity).toFixed(2), oData.items[0].uom, parseFloat(oData.items[0].amount).toFixed(2)],
				["", "", "", "", ""],
				["", "", "", "", ""]
			];

			doc.autoTable({
				startY: y,
				head: [['S.No', 'DESCRIPTION', 'QTY', 'UOM', 'Material Value(Rs.)']],
				body: tableData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], minCellHeight: 10 },
				columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 25 }, 3: { cellWidth: 35 }, 4: { cellWidth: 40 } },
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;
			
			// Remarks row
			doc.rect(margin, finalY, pageWidth - margin * 2, 8);
			doc.text("Remarks", margin + 2, finalY + 5);
			doc.text(oData.Remarks || "", margin + 30, finalY + 5);
			doc.line(margin + 28, finalY, margin + 28, finalY + 8);

			// Footer details
			finalY += 14;
			doc.text("Req User:", margin, finalY);
			doc.text("Senthilmurugan R", margin + 30, finalY); // Mock user

			doc.text("Dept:", margin + 80, finalY);
			doc.text("OPERATION", margin + 110, finalY);

			finalY += 8;
			doc.text("Approved By:", margin, finalY);
			doc.text("Selvakumar M", margin + 30, finalY);

			doc.text("Vehicle No:", margin + 80, finalY);
			doc.setFont("helvetica", "bold");
			doc.text(oData.VehicleNo || "", margin + 110, finalY);
			doc.setFont("helvetica", "normal");

			doc.text("Total Value (Rs.):", margin + 160, finalY);
			doc.text(oData.finalTotal || "0.00", margin + 195, finalY);

			finalY += 6;
			doc.text("(Rupees: " + this._numberToWords(Math.round(parseFloat(oData.finalTotal))) + " Only.)", margin + 160, finalY);

			// Signatures
			finalY += 15;
			doc.setFont("helvetica", "bold");
			doc.text("For MEIL Neyveli Energy Private Limited", margin, finalY);
			
			finalY += 15;
			doc.text("Authorised Signatory", margin, finalY);
			doc.text("Receiver's Sign", pageWidth - margin, finalY, { align: "right" });

			doc.save("AGP_" + (oData.requestId || "Draft") + ".pdf");
			sap.m.MessageToast.show("Gate Pass Downloaded");
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image(); img.crossOrigin = "Anonymous";
				img.onload = function () {
					var canvas = document.createElement("canvas");
					canvas.width = img.width; canvas.height = img.height;
					var ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
					resolve(canvas.toDataURL("image/png"));
				};
				img.onerror = function (err) { reject(err); }; img.src = url;
			});
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
		}

	});
});
