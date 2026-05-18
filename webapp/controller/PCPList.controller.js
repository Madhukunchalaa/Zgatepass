sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.PCPList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("PCPList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._loadPCPList();
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		_loadPCPList: function () {
			var oView = this.getView();
			var oODataModel = this.getOwnerComponent().getModel();

			sap.ui.core.BusyIndicator.show(0);
			// Fetch PCPs
			oODataModel.read("/PCPHdrSet", {
				filters: [new Filter("SourceType", FilterOperator.EQ, "PCP")],
				urlParameters: {
					"$expand": "PCPItmNav"
				},
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];

					// Format data for the view
					aResults.forEach(function (oItem) {
						if (oItem.PCPDate) {
							var pd = new Date(oItem.PCPDate);
							if (!isNaN(pd.getTime())) oItem.PCPDate = pd.getDate().toString().padStart(2, "0") + "-" + (pd.getMonth() + 1).toString().padStart(2, "0") + "-" + pd.getFullYear();
						}
						if (oItem.GEDate) {
							var gd = new Date(oItem.GEDate);
							if (!isNaN(gd.getTime())) oItem.GEDate = gd.getDate().toString().padStart(2, "0") + "-" + (gd.getMonth() + 1).toString().padStart(2, "0") + "-" + gd.getFullYear();
						}

						// Get first item desc
						oItem.FirstItemDesc = "";
						if (oItem.PCPItmNav && oItem.PCPItmNav.results && oItem.PCPItmNav.results.length > 0) {
							oItem.FirstItemDesc = oItem.PCPItmNav.results[0].ItemDescription || "";
						}
					});

					var oListModel = new JSONModel(aResults);
					oView.setModel(oListModel, "pcpList");
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load PCP List.");
					oView.setModel(new JSONModel([]), "pcpList");
				}
			});
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue");
			var oTable = this.getView().byId("pcpTable");
			var oBinding = oTable.getBinding("items");

			if (sQuery) {
				var aFilters = [
					new Filter("GateEntryNo", FilterOperator.Contains, sQuery),
					new Filter("VendorDesc", FilterOperator.Contains, sQuery),
					new Filter("DCNumber", FilterOperator.Contains, sQuery)
				];
				var oFilter = new Filter({ filters: aFilters, and: false });
				oBinding.filter([oFilter]);
			} else {
				oBinding.filter([]);
			}
		},

		// ==========================================================
		// POPUP LOGIC
		// ==========================================================

		onAddPCP: function () {
			this._openPCPDialog("CREATE");
		},

		onViewPCP: function (oEvent) {
			var oRowCtx = oEvent.getSource().getBindingContext("pcpList");
			this._openPCPDialog("VIEW", oRowCtx.getObject());
		},

		onEditPCP: function (oEvent) {
			var oRowCtx = oEvent.getSource().getBindingContext("pcpList");
			this._openPCPDialog("EDIT", oRowCtx.getObject());
		},

		_openPCPDialog: function (sMode, oDataObj) {
			if (!this._pPcpDialog) {
				this._pPcpDialog = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.PCPDialog",
					controller: this
				}).then(function (oDialog) {
					this.getView().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}

			this._pPcpDialog.then(function (oDialog) {
				this._setupPcpModel(sMode, oDataObj);

				// Configure View Mode vs Edit Mode
				var bIsView = sMode === "VIEW";
				this.getView().byId("pcpEntryPoint").setEditable(!bIsView);
				this.getView().byId("pcpGENo").setEditable(sMode === "CREATE");
				this.getView().byId("pcpDate").setEditable(!bIsView);
				this.getView().byId("pcpDCInvoiceNo").setEditable(!bIsView);
				this.getView().byId("pcpDCInvoiceDate").setEditable(!bIsView);
				this.getView().byId("pcpBudgetCode").setEditable(!bIsView);
				this.getView().byId("pcpTotalCost").setEditable(!bIsView);

				this.getView().byId("btnSubmitPCP").setVisible(!bIsView);

				oDialog.open();
			}.bind(this));
		},

		_setupPcpModel: function (sMode, oSourceData) {
			var oData = {};

			if (sMode === "CREATE" || !oSourceData) {
				var oDate = new Date();
				var sDate = oDate.getFullYear() + "-" +
					String(oDate.getMonth() + 1).padStart(2, "0") + "-" +
					String(oDate.getDate()).padStart(2, "0");

				oData = {
					EntryPoint: "PLANT",
					GEDate: sDate,
					GateEntryNo: "",
					PCPDate: sDate,
					VendorDesc: "",
					Department: "",
					DCNumber: "",
					DCdate: "",
					ItemDescription: "",
					RecievedQuantity: "0.00",
					UOM: "",
					Plant: "",
					SourceType: "",
					ItemNo: "",
					BudgetCode: "",
					TotalCost: ""
				};
			} else {
				// Format back from DD-MM-YYYY to YYYY-MM-DD for date pickers
				var formatBack = function (d) {
					if (!d) return "";
					var parts = d.split("-");
					if (parts.length === 3 && parts[0].length === 2) return parts[2] + "-" + parts[1] + "-" + parts[0];
					return d;
				};

				oData = {
					EntryPoint: oSourceData.EntryPoint || "PLANT",
					GEDate: formatBack(oSourceData.GEDate),
					GateEntryNo: oSourceData.GateEntryNo,
					PCPDate: formatBack(oSourceData.PCPDate),
					VendorDesc: oSourceData.VendorDesc || oSourceData.VendorName || "",
					Department: oSourceData.Department,
					DCNumber: oSourceData.DCNumber,
					DCdate: formatBack(oSourceData.DCdate),
					ItemDescription: oSourceData.FirstItemDesc,
					RecievedQuantity: "0.00",
					UOM: "",
					Plant: oSourceData.Plant || "",
					SourceType: oSourceData.SourceType || "",
					ItemNo: "",
					BudgetCode: oSourceData.BudgetCode,
					TotalCost: oSourceData.TotalCost || "0"
				};

				if (oSourceData.PCPItmNav && oSourceData.PCPItmNav.results && oSourceData.PCPItmNav.results.length > 0) {
					oData.RecievedQuantity = oSourceData.PCPItmNav.results[0].RecievedQuantity || "0.00";
					oData.UOM = oSourceData.PCPItmNav.results[0].UOM || "";
					oData.ItemNo = oSourceData.PCPItmNav.results[0].ItemNo || "";
				}
			}

			var oModel = this.getView().getModel("pcpModel");
			if (!oModel) {
				this.getView().setModel(new JSONModel(oData), "pcpModel");
			} else {
				oModel.setData(oData);
			}
		},

		onClosePCPDialog: function () {
			this._pPcpDialog.then(function (oDialog) {
				oDialog.close();
			});
		},

		onGateEntryNoChange: function (oEvent) {
			var sGE = oEvent.getParameter("value");
			if (!sGE) return;

			var oODataModel = this.getOwnerComponent().getModel();
			var oPcpModel = this.getView().getModel("pcpModel");

			sap.ui.core.BusyIndicator.show(0);
			// Fetch the PCP Data based on GE No
			var sPath = "/PCPHdrSet";
			oODataModel.read(sPath, {
				filters: [new Filter("GateEntryNo", FilterOperator.EQ, sGE)],
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length > 0) {
						var oResult = aResults[0];
						oPcpModel.setProperty("/VendorDesc", oResult.VendorDesc || oResult.VendorName || "");
						oPcpModel.setProperty("/Department", oResult.Department || "");
						oPcpModel.setProperty("/DCNumber", oResult.DCNumber || "");
						oPcpModel.setProperty("/Plant", oResult.Plant || "");
						oPcpModel.setProperty("/SourceType", oResult.SourceType || "");
						if (oResult.DCdate) {
							var pd = new Date(oResult.DCdate);
							if (!isNaN(pd.getTime())) oPcpModel.setProperty("/DCdate", pd.getFullYear() + "-" + String(pd.getMonth() + 1).padStart(2, "0") + "-" + String(pd.getDate()).padStart(2, "0"));
						}
						if (oResult.PCPItmNav && oResult.PCPItmNav.results && oResult.PCPItmNav.results.length > 0) {
							var oItem = oResult.PCPItmNav.results[0];
							oPcpModel.setProperty("/ItemDescription", oItem.ItemDescription || "");
							oPcpModel.setProperty("/RecievedQuantity", oItem.RecievedQuantity || "0.00");
							oPcpModel.setProperty("/UOM", oItem.UOM || "");
							oPcpModel.setProperty("/ItemNo", oItem.ItemNo || "");
						}
						MessageToast.show("Gate Entry details fetched.");
					} else {
						MessageBox.warning("No Gate Entry found with number: " + sGE);
					}
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to fetch Gate Entry details.");
				}
			});
		},

		_formatDateToSAP: function (sDate) {
			if (!sDate) return "";
			var oDate = new Date(sDate);
			if (isNaN(oDate.getTime())) return "";
			return oDate.getFullYear() + String(oDate.getMonth() + 1).padStart(2, "0") + String(oDate.getDate()).padStart(2, "0");
		},

		onSubmitPCP: function () {
			var oPcpModel = this.getView().getModel("pcpModel");
			var oData = oPcpModel.getData();

			if (!oData.GateEntryNo) { MessageBox.error("Please enter Gate Entry No."); return; }
			if (!oData.BudgetCode) { MessageBox.error("Please select a Budget Code."); return; }

			var fTotalCost = parseFloat(oData.TotalCost || 0);
			if (fTotalCost > 5000) {
				MessageBox.error("Total Cost for Petty Cash Purchase cannot exceed 5000.");
				return;
			}

			var oPayload = {
				GateEntryNo: oData.GateEntryNo,
				EntryPoint: oData.EntryPoint || "PLANT",
				PCPDate: this._formatDateToSAP(oData.PCPDate),
				DCdate: this._formatDateToSAP(oData.DCdate),
				DCNumber: oData.DCNumber || "",
				BudgetCode: oData.BudgetCode || "",
				SourceType: oData.SourceType || "PettyCash",
				Plant: oData.Plant || "",
				VendorDesc: oData.VendorDesc || "",
				Department: oData.Department || "",
				PCPItmNav: [
					{
						PCPNo: "",
						SourceType: "PettyCash",
						ItemNo: oData.ItemNo || "00010",
						ItemDescription: oData.ItemDescription || "",
						RecievedQuantity: String(parseFloat(oData.RecievedQuantity || 0).toFixed(3)),
						UOM: oData.UOM || "",
						TotalCost: oData.TotalCost ? String(parseFloat(oData.TotalCost).toFixed(2)) : "0.00",
						GateEntryNo: oData.GateEntryNo
					}
				]
			};

			var oODataModel = this.getOwnerComponent().getModel();
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.create("/PCPHdrSet", oPayload, {
				success: function (oResponse) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = (oResponse && oResponse.Message) ? oResponse.Message : "Success";
					MessageBox.success(sMsg, {
						onClose: function () {
							this.onClosePCPDialog();
							this._loadPCPList(); // Refresh the list
						}.bind(this)
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sErrMsg = "Failed to submit PCP.";
					try {
						var oErrBody = JSON.parse(oError.responseText);
						sErrMsg = oErrBody.error.message.value || sErrMsg;
					} catch (e) { /* ignore */ }
					MessageBox.error(sErrMsg);
				}
			});
		},

		// ==========================================================
		// PRINTING LOGIC
		// ==========================================================

		onPrintPCP: function () {
			var oPcpModel = this.getView().getModel("pcpModel");
			this._generatePDF(oPcpModel.getData());
		},

		onPrintRow: function (oEvent) {
			var oRowCtx = oEvent.getSource().getBindingContext("pcpList");
			var oSourceData = oRowCtx.getObject();

			var formatBack = function (d) {
				if (!d) return "";
				var parts = d.split("-");
				if (parts.length === 3 && parts[0].length === 2) return parts[2] + "-" + parts[1] + "-" + parts[0];
				return d;
			};

			var oData = {
				EntryPoint: oSourceData.EntryPoint || "PLANT",
				GEDate: formatBack(oSourceData.GEDate),
				GateEntryNo: oSourceData.GateEntryNo,
				PCPDate: formatBack(oSourceData.PCPDate),
				VendorDesc: oSourceData.VendorDesc || oSourceData.VendorName || "",
				Department: oSourceData.Department,
				DCNumber: oSourceData.DCNumber,
				DCdate: formatBack(oSourceData.DCdate),
				ItemDescription: oSourceData.FirstItemDesc,
				RecievedQuantity: "0.00",
				UOM: "",
				BudgetCode: oSourceData.BudgetCode,
				TotalCost: oSourceData.TotalCost || "0"
			};

			if (oSourceData.PCPItmNav && oSourceData.PCPItmNav.results && oSourceData.PCPItmNav.results.length > 0) {
				oData.RecievedQuantity = oSourceData.PCPItmNav.results[0].RecievedQuantity || "0.00";
				oData.UOM = oSourceData.PCPItmNav.results[0].UOM || "";
			}

			this._generatePDF(oData);
		},

		_generatePDF: async function (oData) {
			if (!oData.GateEntryNo) {
				sap.m.MessageBox.warning("Please enter Gate Entry No before printing.");
				return;
			}

			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('l', 'mm', 'a4');
			var pageWidth = doc.internal.pageSize.width;
			var margin = 14;

			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 10, 30, 11);
			} catch (e) {
				doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(180, 0, 0);
				doc.text("MEIL", margin, 18); doc.setTextColor(0, 0, 0);
			}

			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "normal"); doc.setFontSize(16);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 14, { align: "center" });
			doc.setFontSize(8);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 19, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 23, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 27, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTCO26223", pageWidth / 2, 31, { align: "center" });

			doc.setFontSize(11);
			doc.setFont("helvetica", "bold");
			doc.text("CASH PURCHASE NOTE", pageWidth / 2, 42, { align: "center" });
			var titleW = doc.getTextWidth("CASH PURCHASE NOTE");
			doc.setLineWidth(0.3);
			doc.line(pageWidth / 2 - titleW / 2, 43.5, pageWidth / 2 + titleW / 2, 43.5);

			var y = 55;
			doc.setFontSize(9);
			doc.setFont("helvetica", "normal");

			doc.text("Vendor", margin, y);
			doc.text("Name:", margin, y + 5);
			doc.text(oData.VendorDesc || "", margin + 18, y + 5);

			var col2X = 100;
			doc.text("PCP No:", col2X, y);
			doc.text(oData.GateEntryNo ? "PCP-" + new Date().getFullYear() + "/" + oData.GateEntryNo : "", col2X + 22, y);
			doc.text("PCP Date:", col2X, y + 6);
			doc.text(oData.PCPDate || "", col2X + 22, y + 6);
			doc.text("DC/Inv No:", col2X, y + 12);
			doc.text(oData.DCNumber || "", col2X + 22, y + 12);
			doc.text("Dept:", col2X, y + 18);
			doc.text(oData.Department || "", col2X + 22, y + 18);

			var col3X = 180;
			doc.text("GE No", col3X, y);
			doc.text(oData.GateEntryNo || "", col3X + 25, y);
			doc.text("GE Date:", col3X, y + 6);
			doc.text(oData.GEDate || "", col3X + 25, y + 6);
			doc.text("DC/Inv Date:", col3X, y + 12);
			doc.text(oData.DCdate || "", col3X + 25, y + 12);
			doc.text("Budget Code:", col3X, y + 18);
			doc.text(oData.BudgetCode || "", col3X + 25, y + 18);

			var tableY = y + 26;
			var tableData = [
				[
					"1",
					oData.ItemDescription || "",
					oData.UOM || "",
					parseFloat(oData.RecievedQuantity || 0).toFixed(2),
					parseFloat(oData.TotalCost || 0).toFixed(2)
				]
			];

			doc.autoTable({
				startY: tableY,
				head: [['S.No', 'DESCRIPTION', 'UOM', 'QTY', 'Amount']],
				body: tableData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'normal', lineWidth: 0.3, lineColor: [0, 0, 0] },
				bodyStyles: { textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0], cellPadding: 3 },
				columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 35 }, 3: { cellWidth: 35 }, 4: { cellWidth: 35 } },
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;
			var totalAmt = parseFloat(oData.TotalCost || 0);

			var footH = 9;
			doc.setLineWidth(0.3);
			doc.rect(margin, finalY, pageWidth - margin * 2, footH);

			var cols = doc.lastAutoTable.columns;
			var inWordsW = cols[0].width + cols[1].width + cols[2].width;
			var totalLabelW = cols[3].width;

			doc.line(margin + inWordsW, finalY, margin + inWordsW, finalY + footH);
			doc.line(margin + inWordsW + totalLabelW, finalY, margin + inWordsW + totalLabelW, finalY + footH);

			doc.text("In Words - Rupees " + this._numberToWords(Math.round(totalAmt)) + " Only.", margin + 3, finalY + 6);
			doc.text("Total", margin + inWordsW + 3, finalY + 6);
			doc.text(totalAmt.toFixed(2), margin + inWordsW + totalLabelW + 3, finalY + 6);

			doc.text("For MEIL Neyveli Energy Private Limited", pageWidth - margin, finalY + 50, { align: "right" });
			doc.text("Authorised Signatory", pageWidth - margin, finalY + 70, { align: "right" });

			doc.save("PCP_" + (oData.GateEntryNo || "Draft") + ".pdf");
			sap.m.MessageToast.show("CASH PURCHASE NOTE Downloaded");
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
