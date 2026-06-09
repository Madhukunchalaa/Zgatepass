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
			var sGPNo = decodeURIComponent(oEvent.getParameter("arguments").gpNo);
			this._loadDetail(sGPNo);
		},

		_loadDetail: function (sGPNo) {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/AshHdrSet", {
				filters: [
					new sap.ui.model.Filter("GatePassNo", sap.ui.model.FilterOperator.EQ, sGPNo),
					new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, "NRGP")
				],
				urlParameters: { "$expand": "ASHItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					var oItem = aResults.find(function (item) {
						return item.GatePassNo === sGPNo;
					});
					if (oItem) {
						var nTotal = 0;
						var aItems = [];
						if (oItem.ASHItmNav) {
							if (Array.isArray(oItem.ASHItmNav)) {
								aItems = oItem.ASHItmNav;
							} else if (oItem.ASHItmNav.results && Array.isArray(oItem.ASHItmNav.results)) {
								aItems = oItem.ASHItmNav.results;
							}
						}
						aItems.forEach(function(item) {
							nTotal += parseFloat(item.Totalvalue || 0);
						});
						oItem.ASHItmNav = aItems;
						oItem.finalTotal = nTotal.toFixed(2);

						var oModel = new JSONModel(oItem);
						that.getView().setModel(oModel, "ash");
					} else {
						MessageBox.error("Ash Gate Pass not found.");
						that.onNavBack();
					}
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load Ash Gate Pass details. Please try again.");
					that.onNavBack();
				}
			});
		},

		onNavBack: function () {
			this.getRouter().navTo("AshGatePassList");
		},

		onPrint: async function () {
			var oModel = this.getView().getModel("ash");
			if (!oModel) return;
			var oData = oModel.getData();

			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('l', 'mm', 'a4');
			var pageWidth = doc.internal.pageSize.width;
			var margin = 14;

			// Header Logo
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower.com/images/meil_logo.png");
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
			doc.text("GSTIN : 33AACCS2753B1ZV | CIN : U40109TN1993PTC026223", pageWidth / 2, 27, { align: "center" });

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
			doc.text("Gate Pass No: " + (oData.GatePassNo || ""), margin, y);
			
			doc.setFont("helvetica", "normal");
			doc.text("Please allow:", margin, y + 10);
			doc.text("The Manager,", margin + 30, y + 6);
			
			// Customer Name & City wrapping
			var custDetails = (oData.CustomerName || "") + "\n" + (oData.City || "") + " " + (oData.ZipCode || "");
			var splitCust = doc.splitTextToSize(custDetails, 120);
			doc.text(splitCust, margin + 30, y + 10);

			// Right side details
			var rightColX = 200;
			doc.text("GP Date:", rightColX, y);
			var gpDate = this.formatDate(oData.GPDate);
			doc.text(gpDate, rightColX + 25, y);

			doc.text("Customer GST:", rightColX, y + 6);
			doc.text(oData.CustomerGst || "", rightColX + 25, y + 6);

			doc.text("Sales Doc:", rightColX, y + 12);
			doc.text(oData.SalesDocument || "", rightColX + 25, y + 12);

			y = y + 30;
			doc.setTextColor(0, 102, 204); // blueish text
			doc.text("To take out the following material:", margin, y);
			doc.setTextColor(0, 0, 0);

			// Table
			y = y + 4;
			var tableData = (oData.ASHItmNav || []).map(function(item, idx) {
				return [
					String(idx + 1),
					item.Material || "",
					item.MaterialDescription || "",
					item.HSNCode || "",
					parseFloat(item.RequestedQuantity || 0).toFixed(3),
					item.UOM || "",
					parseFloat(item.ItemNetPrice || 0).toFixed(2),
					parseFloat(item.Totalvalue || 0).toFixed(2)
				];
			});

			doc.autoTable({
				startY: y,
				head: [['S.No', 'Material Code', 'Material Description', 'HSN Code', 'Qty', 'UOM', 'Unit Price', 'Total Value(Rs.)']],
				body: tableData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], minCellHeight: 10 },
				columnStyles: {
					0: { cellWidth: 15 },
					1: { cellWidth: 35 },
					2: { cellWidth: 80 },
					3: { cellWidth: 25 },
					4: { cellWidth: 25 },
					5: { cellWidth: 20 },
					6: { cellWidth: 30 },
					7: { cellWidth: 39 }
				},
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
			doc.text(oData.RequestedBy || "", margin + 30, finalY);

			doc.text("Dept:", margin + 80, finalY);
			doc.text(oData.Department || "", margin + 110, finalY);

			finalY += 8;
			doc.text("Approved By:", margin, finalY);
			doc.text(oData.ApprovedBy || "", margin + 30, finalY);

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

			doc.save("AGP_" + (oData.GatePassNo || "Draft") + ".pdf");
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
		},

		formatDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				return vDate.toLocaleDateString('en-GB'); // dd/mm/yyyy
			}
			if (typeof vDate === "string") {
				if (vDate.length === 8 && !vDate.includes("-")) {
					return vDate.substr(6, 2) + "/" + vDate.substr(4, 2) + "/" + vDate.substr(0, 4);
				}
				if (vDate.includes("-")) {
					var parts = vDate.split("-");
					if (parts.length === 3) {
						return parts[2] + "/" + parts[1] + "/" + parts[0];
					}
				}
			}
			return vDate;
		}

	});
});
