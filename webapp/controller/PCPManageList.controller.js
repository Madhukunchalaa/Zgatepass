sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.PCPManageList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ results: [] }), "pcpManageList");
			this.getRouter().getRoute("PCPManageList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadList();
		},

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected.");
				return;
			}

			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/PCPHdrSet", {
				filters: [new Filter("SourceType", FilterOperator.EQ, "PettyCash")],
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = (oData.results || []).map(function (oItem) {
						var sFirstDesc = "";
						var sFirstQty  = "";
						var sFirstUOM  = "";
						var sFirstItemNo = "";
						if (oItem.PCPItmNav && oItem.PCPItmNav.results && oItem.PCPItmNav.results.length > 0) {
							var oItm = oItem.PCPItmNav.results[0];
							sFirstDesc   = oItm.ItemDescription  || "";
							sFirstQty    = oItm.RecievedQuantity  || "";
							sFirstUOM    = oItm.UOM               || "";
							sFirstItemNo = oItm.ItemNo            || "";
						}
						return {
							GEDateRaw:    oItem.GEDate      || "",
							GEDate:       that._formatDate(oItem.GEDate),
							PCPDate:      that._formatDate(oItem.PCPDate),
							GateEntryNo:  oItem.GateEntryNo  || "",
							VendorDesc:   oItem.VendorDesc   || "",
							Vendor:       oItem.Vendor       || "",
							SourceType:   oItem.SourceType   || "PettyCash",
							Department:   oItem.Department   || "",
							DCNumber:     oItem.DCNumber     || "",
							DCdate:       oItem.DCdate       || "",
							RGPNumber:    oItem.RGPNumber    || "",
							RRNo:         oItem.RRNo         || "",
							Plant:        oItem.Plant        || "",
							BudgetCode:   oItem.BudgetCode   || "",
							GatepassNo:   (oItem.GatepassNo  || "").trim(),
							TotalCost:    oItem.TotalCost    || "0.00",
							EntryPoint:   oItem.EntryPoint   || "",
							Remarks:      oItem.Remarks      || "",
							InspectionStatus: oItem.InspectionStatus || "",
							Inspectiondate:   oItem.Inspectiondate   || "",
							FirstItemDesc:    sFirstDesc,
							ItemDescription:  sFirstDesc,
							RecievedQuantity: sFirstQty,
							UOM:              sFirstUOM,
							ItemNo:           sFirstItemNo,
							PCPItmNav:        oItem.PCPItmNav || { results: [] }
						};
					});

					// Sort by GEDate desc
					aResults.sort(function (a, b) {
						return (b.GEDateRaw || "").localeCompare(a.GEDateRaw || "");
					});

					that.getView().getModel("pcpManageList").setProperty("/results", aResults);
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load PCP list.");
					that.getView().getModel("pcpManageList").setProperty("/results", []);
				}
			});
		},

		onSearch: function () {
			this._applyFilters();
		},

		onApplyFilters: function () {
			this._applyFilters();
		},

		onClearFilters: function () {
			this.byId("idPCPSearch").setValue("");
			this.byId("idPCPStatusFilter").setSelectedKey("");
			this.byId("idExcelFromDate").setValue("");
			this.byId("idExcelToDate").setValue("");
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("idPCPTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) return;

			var aFilters = [];

			// 1. Search Filter
			var sQuery = this.byId("idPCPSearch").getValue().trim();
			if (sQuery) {
				var sLow = sQuery.toLowerCase();
				aFilters.push(new Filter({
					path: "",
					test: function (oValue, oContext) {
						var o = oContext ? oContext.getObject() : oValue;
						if (!o) return false;
						for (var key in o) {
							if (o.hasOwnProperty(key) && o[key] !== null && o[key] !== undefined) {
								if (typeof o[key] === "string" || typeof o[key] === "number" || typeof o[key] === "boolean") {
									if (String(o[key]).toLowerCase().indexOf(sLow) !== -1) {
										return true;
									}
								} else if (typeof o[key] === "object") {
									try {
										var sObjStr = JSON.stringify(o[key]).toLowerCase();
										if (sObjStr.indexOf(sLow) !== -1) {
											return true;
										}
									} catch (e) {}
								}
							}
						}
						return false;
					}
				}));
			}

			// 2. Status Filter (PCP Status: Closed if has GatepassNo, Pending if GatepassNo is empty)
			var sStatus = this.byId("idPCPStatusFilter").getSelectedKey();
			if (sStatus) {
				aFilters.push(new Filter({
					path: "GatepassNo",
					test: function (sVal) {
						if (sStatus === "Closed") {
							return !!sVal;
						} else {
							return !sVal;
						}
					}
				}));
			}

			// 3. Date Range Filter
			var sFrom = this.byId("idExcelFromDate").getDateValue();
			var sTo = this.byId("idExcelToDate").getDateValue();
			if (sFrom || sTo) {
				var oFrom = sFrom ? new Date(sFrom.getFullYear(), sFrom.getMonth(), sFrom.getDate()) : null;
				var oTo = sTo ? new Date(sTo.getFullYear(), sTo.getMonth(), sTo.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "GEDate",
					test: function (sValue) {
						if (!sValue) return false;
						var aParts = sValue.split("-");
						if (aParts.length !== 3) return false;
						var dVal = new Date(parseInt(aParts[2]), parseInt(aParts[1], 10) - 1, parseInt(aParts[0]));
						if (oFrom && dVal < oFrom) return false;
						if (oTo && dVal > oTo) return false;
						return true;
					}
				}));
			}

			oBinding.filter(aFilters);
		},

		_storeAndNavigate: function (oItem, sMode) {
			var oCore = sap.ui.getCore();
			var oModel = oCore.getModel("selectedPCPEntry");
			if (!oModel) {
				oModel = new sap.ui.model.json.JSONModel();
				oCore.setModel(oModel, "selectedPCPEntry");
			}
			oModel.setData({ row: oItem || {}, mode: sMode });
			this.getRouter().navTo("PCPManageDetail");
		},

		onViewRow: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("pcpManageList").getObject();
			this._storeAndNavigate(oItem, "VIEW");
		},

		onEditRow: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("pcpManageList").getObject();
			this._storeAndNavigate(oItem, "EDIT");
		},

		onPrintRow: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("pcpManageList").getObject();
			this._storeAndNavigate(oItem, "PRINT");
		},

		onDownloadExcel: function () {
			var aData = this.getView().getModel("pcpManageList").getProperty("/results") || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aData = ExcelExport.filterByDate(aData, "GEDate", dFrom, dTo);
			if (!aData.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = [];
			aData.forEach(function (o) {
				var oHeader = {
					"PCP No": o.GatepassNo || "",
					"PCP Date": o.PCPDate || "",
					"Entry": o.EntryPoint || "",
					"GE No": o.GateEntryNo || "",
					"GE Date": o.GEDate || "",
					"Supplier": o.VendorDesc || "",
					"Items": o.FirstItemDesc || "",
					"DC/INV No": o.DCNumber || "",
					"Status": o.GatepassNo ? "Closed" : "Pending",
					"Plant": o.Plant || "",
					"Vendor": o.Vendor || "",
					"Department": o.Department || "",
					"Source Type": o.SourceType || "",
					"RGP No": o.RGPNumber || "",
					"RR No": o.RRNo || "",
					"Budget Code": o.BudgetCode || "",
					"Total Cost": o.TotalCost || "",
					"Remarks": o.Remarks || "",
					"Inspection Status": o.InspectionStatus || "",
					"Inspected Date": o.Inspectiondate || "",
					"DC Date": o.DCdate || ""
				};
				var aItems = (o.PCPItmNav && (Array.isArray(o.PCPItmNav) ? o.PCPItmNav : o.PCPItmNav.results)) || [];
				if (aItems.length === 0) {
					oHeader["Item No"] = "";
					oHeader["Item Description"] = "";
					oHeader["Order Qty"] = "";
					oHeader["Received Qty"] = "";
					oHeader["Item UOM"] = "";
					oHeader["Item Total Cost"] = "";
					aRows.push(oHeader);
				} else {
					aItems.forEach(function (item) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item No"] = item.ItemNo || "";
						oRow["Item Description"] = item.ItemDescription || "";
						oRow["Order Qty"] = item.OrderQuantity || "";
						oRow["Received Qty"] = item.RecievedQuantity || "";
						oRow["Item UOM"] = item.UOM || "";
						oRow["Item Total Cost"] = item.TotalCost || "";
						aRows.push(oRow);
					});
				}
			});
			var aParts = ["PCP_List"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", 21);
		},

		onCreateNew: function () {
			this._storeAndNavigate(null, "CREATE");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onPrintList: function () {
			var oTable = this.byId("idPCPTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("pcpManageList").getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>PCP List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>PCP List</h2><table><thead><tr>";
			sHtml += "<th>PCP No</th><th>PCP Date</th><th>Entry</th><th>GE No</th><th>GE Date</th><th>Supplier</th><th>Items</th><th>DC/INV No</th><th>Status</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				var sStatus = o.GatepassNo ? "Closed" : "Pending";
				sHtml += "<tr>";
				sHtml += "<td>" + (o.GatepassNo || "") + "</td>";
				sHtml += "<td>" + (o.PCPDate || "") + "</td>";
				sHtml += "<td>" + (o.EntryPoint || "") + "</td>";
				sHtml += "<td>" + (o.GateEntryNo || "") + "</td>";
				sHtml += "<td>" + (o.GEDate || "") + "</td>";
				sHtml += "<td>" + (o.VendorDesc || "") + "</td>";
				sHtml += "<td>" + (o.FirstItemDesc || "") + "</td>";
				sHtml += "<td>" + (o.DCNumber || "") + "</td>";
				sHtml += "<td>" + sStatus + "</td>";
				sHtml += "</tr>";
			});
			sHtml += "</tbody></table></body></html>";
			var oWindow = window.open("", "_blank");
			oWindow.document.write(sHtml);
			oWindow.document.close();
			oWindow.focus();
			setTimeout(function () { oWindow.print(); oWindow.close(); }, 500);
		},

		onCopyList: function () {
			var oTable = this.byId("idPCPTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("pcpManageList").getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["PCP No", "PCP Date", "Entry", "GE No", "GE Date", "Supplier", "Items", "DC/INV No", "Status"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				var sStatus = o.GatepassNo ? "Closed" : "Pending";
				aLines.push([
					o.GatepassNo || "",
					o.PCPDate || "",
					o.EntryPoint || "",
					o.GateEntryNo || "",
					o.GEDate || "",
					o.VendorDesc || "",
					o.FirstItemDesc || "",
					o.DCNumber || "",
					sStatus
				].join("\t"));
			});
			var sText = aLines.join("\n");
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(sText).then(function () {
					sap.m.MessageToast.show("List copied to clipboard.");
				});
			} else {
				var textArea = document.createElement("textarea");
				textArea.value = sText;
				document.body.appendChild(textArea);
				textArea.select();
				document.execCommand("copy");
				document.body.removeChild(textArea);
				sap.m.MessageToast.show("List copied to clipboard.");
			}
		}

	});
});
