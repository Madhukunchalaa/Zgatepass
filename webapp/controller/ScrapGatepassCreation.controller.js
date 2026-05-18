sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.ScrapGatepassCreation", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("ScrapGatepassCreation").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._initModel();
		},

		_initModel: function () {
			var oDate = new Date();
			
			var oData = {
				requestDate: oDate,
				vendor: "",
				vendorAddress: "",
				vendorGST: "",
				remarks: "",
				vehicleNo: "",
				items: [
					{
						sno: "1",
						type: "",
						description: "",
						availQty: "0",
						sendoutQty: "",
						uom: ""
					}
				]
			};

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "scrapGp");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onVendorSelect: function (oEvent) {
			var oModel = this.getView().getModel("scrapGp");
			var sKey = oEvent.getParameter("selectedItem").getKey();
			
			if (sKey === "V1") {
				oModel.setProperty("/vendorAddress", "Sri Manikandan Traders, No.102, Vridhachalam Main Road,, Neyveli, India, 607802");
				oModel.setProperty("/vendorGST", "33ABEFS1534J1ZB");
			} else if (sKey === "V2") {
				oModel.setProperty("/vendorAddress", "Metal Scrap Buyers Pvt Ltd, Chennai");
				oModel.setProperty("/vendorGST", "33XXXXXXXXXXXXX");
			}
		},

		onMaterialTypeSelect: function (oEvent) {
			var oSelect = oEvent.getSource();
			var sType = oSelect.getSelectedKey();
			var oContext = oSelect.getBindingContext("scrapGp");
			var sPath = oContext.getPath();
			var oModel = this.getView().getModel("scrapGp");

			var oInventory = JSON.parse(localStorage.getItem("mockScrapInventory") || "{}");
			
			if (sType && oInventory[sType]) {
				oModel.setProperty(sPath + "/availQty", oInventory[sType].quantity.toString());
				oModel.setProperty(sPath + "/uom", oInventory[sType].uom);
			} else {
				oModel.setProperty(sPath + "/availQty", "0");
				oModel.setProperty(sPath + "/uom", "KILOGRAM");
			}
		},

		onAddItem: function () {
			var oModel = this.getView().getModel("scrapGp");
			var aItems = oModel.getProperty("/items");
			aItems.push({
				sno: String(aItems.length + 1),
				type: "",
				description: "",
				availQty: "0",
				sendoutQty: "",
				uom: ""
			});
			oModel.setProperty("/items", aItems);
		},

		onRemoveItem: function (oEvent) {
			var oModel = this.getView().getModel("scrapGp");
			var aItems = oModel.getProperty("/items");
			if (aItems.length <= 1) { return; }
			
			var oContext = oEvent.getSource().getBindingContext("scrapGp");
			var iIndex = parseInt(oContext.getPath().split("/").pop(), 10);
			aItems.splice(iIndex, 1);
			
			aItems.forEach(function(oItem, idx) { oItem.sno = String(idx + 1); });
			oModel.setProperty("/items", aItems);
		},

		onSubmit: function () {
			var oModel = this.getView().getModel("scrapGp");
			var oData = oModel.getData();
			
			if (!oData.vendor) { MessageBox.error("Please select a Vendor."); return; }
			if (!oData.vehicleNo) { MessageBox.error("Please enter Vehicle No."); return; }
			
			// Validate Quantities
			var bValid = true;
			var oInventory = JSON.parse(localStorage.getItem("mockScrapInventory") || "{}");
			
			oData.items.forEach(function(item) {
				var sendQty = parseFloat(item.sendoutQty) || 0;
				var availQty = parseFloat(item.availQty) || 0;
				if (!item.type) { bValid = false; MessageBox.error("Please select a Material Type."); }
				else if (sendQty <= 0) { bValid = false; MessageBox.error("Sendout Qty must be greater than 0."); }
				else if (sendQty > availQty) { bValid = false; MessageBox.error("Sendout Qty cannot exceed Avail Qty for " + item.type); }
			});
			
			if (!bValid) return;

			sap.ui.core.BusyIndicator.show(0);
			setTimeout(function() {
				sap.ui.core.BusyIndicator.hide();
				
				// Deduct Inventory
				oData.items.forEach(function(item) {
					var sendQty = parseFloat(item.sendoutQty);
					if (oInventory[item.type]) {
						oInventory[item.type].quantity -= sendQty;
					}
				});
				localStorage.setItem("mockScrapInventory", JSON.stringify(oInventory));
				
				var sSGPNo = "SGP2024-25-" + Math.floor(Math.random() * 9000 + 1000);
				oData.sgpNo = sSGPNo;
				
				MessageToast.show(sSGPNo + " Generated Successfully!");
				
				// Generate PDF
				this._generatePDF(oData);
				
				this.onNavBack();
			}.bind(this), 1000);
		},

		_generatePDF: async function (oData) {
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
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu -607804, India.", pageWidth / 2, 23, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV | CIN : U40109TN1993PTCO26223", pageWidth / 2, 27, { align: "center" });

			// Title
			doc.setFontSize(11);
			doc.text("GATEPASS FOR SCRAP - NON-RETURNABLE MATERIAL", pageWidth / 2, 35, { align: "center" });
			var titleW = doc.getTextWidth("GATEPASS FOR SCRAP - NON-RETURNABLE MATERIAL");
			doc.setLineWidth(0.4);
			doc.line(pageWidth / 2 - titleW / 2, 36, pageWidth / 2 + titleW / 2, 36);

			// Info Details
			var y = 45;
			doc.setFontSize(10);
			doc.setFont("helvetica", "normal");
			doc.text("SGP No:", margin, y);
			doc.setFont("helvetica", "bold");
			doc.text(oData.sgpNo || "", margin + 20, y);
			
			doc.setFont("helvetica", "normal");
			doc.text("SGP Date:", pageWidth - 70, y);
			doc.text(oData.requestDate ? oData.requestDate.toLocaleDateString('en-GB') : "", pageWidth - 45, y);

			y += 8;
			doc.text("Vendor:", margin, y);
			doc.setFont("helvetica", "bold");
			var vendorText = this.getView().byId("scrapGatepassCreationPage").getContent()[0].getItems()[0].getContent()[2].getItems()[1].getSelectedItem()?.getText() || "";
			var vendorAddress = oData.vendorAddress || "";
			var fullVendor = vendorText + ", " + vendorAddress;
			var splitVendor = doc.splitTextToSize(fullVendor, 140);
			doc.text(splitVendor, margin + 20, y);

			doc.setFont("helvetica", "normal");
			doc.text("Vendor GST:", pageWidth - 70, y);
			doc.text(oData.vendorGST || "", pageWidth - 45, y);

			y += (splitVendor.length * 5) + 5;

			// Table
			var tableData = oData.items.map(function(item) {
				return [item.sno, item.type, item.description, parseFloat(item.sendoutQty).toString(), item.uom];
			});

			doc.autoTable({
				startY: y,
				head: [['S.NO', 'MATERIAL TYPE', 'DESCRIPTION', 'QTY', 'UOM']],
				body: tableData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], minCellHeight: 12 },
				columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 40 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 30 }, 4: { cellWidth: 35 } },
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;
			
			// Remarks & Vehicle No
			doc.autoTable({
				startY: finalY,
				body: [
					['Remarks', oData.remarks || 'scrap', '', '', ''],
					['Vehicle No', oData.vehicleNo || '', '', '', '']
				],
				theme: 'grid',
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], fontStyle: 'bold' },
				columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 'auto' } },
				margin: { left: margin, right: margin },
				showHead: false
			});

			finalY = doc.lastAutoTable.finalY;

			// Signatures
			finalY += 8;
			doc.setFont("helvetica", "normal");
			doc.text("For MEIL Neyveli Energy Private Limited", margin, finalY);
			
			var rightVendorName = vendorText || "Vendor";
			doc.text("For " + rightVendorName, pageWidth - margin, finalY + 8, { align: "right" });

			finalY += 25;
			doc.text("Authorised Signatory", margin, finalY);
			doc.text("Receiver's Sign", pageWidth - margin, finalY + 8, { align: "right" });

			doc.save(oData.sgpNo + ".pdf");
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
		}

	});
});
