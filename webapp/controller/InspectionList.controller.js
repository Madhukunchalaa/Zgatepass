sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.InspectionList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ results: [] }), "inspList");
			this.getRouter().getRoute("InspectionList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadData();
		},

		_loadData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = (oUserModel && oUserModel.getProperty("/Plant")) || "";
			var aFilters = sPlant ? [new Filter("Plant", FilterOperator.EQ, sPlant)] : [];

			var that = this;
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/PCPHdrSet", {
				filters: aFilters,
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = (oData.results || []).map(function (oItem) {
						oItem.GEDateRaw = oItem.GEDate || "";
						oItem.GEDate    = that._formatDate(oItem.GEDate);
						oItem.PCPDate   = that._formatDate(oItem.PCPDate);
						oItem.FirstItemDesc = "";
						oItem.RecievedQuantity = "";
						oItem.UOM = "";
						if (oItem.PCPItmNav && oItem.PCPItmNav.results && oItem.PCPItmNav.results.length > 0) {
							var oItm = oItem.PCPItmNav.results[0];
							oItem.FirstItemDesc    = oItm.ItemDescription  || "";
							oItem.RecievedQuantity = oItm.RecievedQuantity || "";
							oItem.UOM              = oItm.UOM              || "";
						}
						return oItem;
					});
					that.getView().getModel("inspList").setProperty("/results", aResults);
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load Gate Entry List.");
					that.getView().getModel("inspList").setProperty("/results", []);
				}
			});
		},

		_toSAPDate: function (sDate) {
			if (!sDate) return "";
			if (/^\d{8}$/.test(sDate)) return sDate;
			var aParts = sDate.split("-");
			if (aParts.length === 3) {
				if (aParts[0].length === 4) return aParts[0] + aParts[1] + aParts[2];
				if (aParts[2].length === 4) return aParts[2] + aParts[1] + aParts[0];
			}
			return sDate;
		},

		onSearch: function () {
			this._applyFilters();
		},

		onApplyFilters: function () {
			this._applyFilters();
		},

		onClearFilters: function () {
			this.byId("idInspectionStatusFilter").setSelectedKey("");
			this.byId("idExcelFromDate").setValue("");
			this.byId("idExcelToDate").setValue("");
			var oTable = this.byId("idInspectionTable");
			var oSearch = oTable.getHeaderToolbar().getContent().find(function (c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			});
			if (oSearch) { oSearch.setValue(""); }
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("idInspectionTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) return;

			var aFilters = [];

			// 1. Search Filter
			var oSearch = oTable.getHeaderToolbar().getContent().find(function (c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			});
			var sQuery = oSearch ? oSearch.getValue().trim() : "";
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

			// 2. Status Filter
			var sStatus = this.byId("idInspectionStatusFilter").getSelectedKey();
			if (sStatus) {
				aFilters.push(new Filter("InspectionStatus", FilterOperator.EQ, sStatus));
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

		onSort: function () {},

		onFilter: function () {},

		onDownloadExcel: function () {
			var oTable = this.byId("idInspectionTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aData = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aData.push(oContext.getObject());
					}
				});
			} else {
				aData = this.getView().getModel("inspList").getProperty("/results") || [];
			}
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aData = ExcelExport.filterByDate(aData, "GEDate", dFrom, dTo);
			if (!aData.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var that = this;
			var aRows = [];
			aData.forEach(function (o) {
				var oHeader = {
					"GE Date": o.GEDate || "",
					"GE No": o.GateEntryNo || "",
					"Supplier": o.VendorDesc || "",
					"Source Type": o.SourceType || "",
					"Dept": o.Department || "",
					"RGP No": o.RGPNumber || "",
					"Inv No": o.DCNumber || "",
					"RR No": o.RRNo || "",
					"Gate Pass No": o.GatepassNo || "",
					"Inspection Status": o.InspectionStatus || "",
					"Plant": o.Plant || "",
					"Vendor": o.Vendor || "",
					"PCP Date": o.PCPDate || "",
					"Entry Point": o.EntryPoint || "",
					"Budget Code": o.BudgetCode || "",
					"Total Cost": o.TotalCost || "",
					"DCDate": that._formatDate(o.DCdate) || "",
					"Remarks": o.Remarks || "",
					"Inspected Date": that._formatDate(o.Inspectiondate) || "",
					"Purchase Order": o.PurchaseOrder || ""
				};
				var aItems = (o.PCPItmNav && (o.PCPItmNav.results || o.PCPItmNav)) || [];
				if (!Array.isArray(aItems)) { aItems = []; }
				if (aItems.length === 0) {
					oHeader["Item No"] = "";
					oHeader["Item Description"] = "";
					oHeader["Order Qty"] = "";
					oHeader["Received Qty"] = "";
					oHeader["Balance Qty"] = "";
					oHeader["Item UOM"] = "";
					oHeader["Item Total Cost"] = "";
					oHeader["Item PO"] = "";
					aRows.push(oHeader);
				} else {
					aItems.forEach(function (itm) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item No"] = itm.ItemNo || "";
						oRow["Item Description"] = itm.ItemDescription || "";
						oRow["Order Qty"] = itm.OrderQuantity || "";
						oRow["Received Qty"] = itm.RecievedQuantity || "";
						oRow["Balance Qty"] = itm.BalanceQuantity || "";
						oRow["Item UOM"] = itm.UOM || "";
						oRow["Item Total Cost"] = itm.TotalCost || "";
						oRow["Item PO"] = itm.PurchaseOrder || "";
						aRows.push(oRow);
					});
				}
			});
			var aParts = ["Inspection_List"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", 20);
		},

		onViewEntry: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("inspList").getObject();
			var sGEDate = this._toSAPDate(oItem.GEDateRaw || oItem.GEDate || "");

			this._storeNavEntry(oItem, sGEDate);

			this.getRouter().navTo("GatePassWithPOEdit", {
				gateEntryNo: oItem.GateEntryNo,
				geDate: sGEDate,
				sourceType: oItem.SourceType || "PO",
				mode: "VIEW"
			});
		},

		onEditEntry: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("inspList").getObject();
			var sGEDate = this._toSAPDate(oItem.GEDateRaw || oItem.GEDate || "");

			this._storeNavEntry(oItem, sGEDate);

			this.getRouter().navTo("GatePassWithPOEdit", {
				gateEntryNo: oItem.GateEntryNo,
				geDate: sGEDate,
				sourceType: oItem.SourceType || "PO",
				mode: "EDIT"
			});
		},

		_storeNavEntry: function (oItem, sGEDateRaw) {
			var aAllResults = this.getView().getModel("inspList").getProperty("/results") || [];
			var aMergedItems = [];
			aAllResults.forEach(function (oRow) {
				if (oRow.GateEntryNo === oItem.GateEntryNo) {
					var aRowItems = (oRow.PCPItmNav && oRow.PCPItmNav.results) || [];
					aRowItems.forEach(function (it) { aMergedItems.push(it); });
				}
			});

			sap.ui.getCore().setModel(new sap.ui.model.json.JSONModel({
				GateEntryNo: oItem.GateEntryNo,
				GEDate: sGEDateRaw,
				SourceType: oItem.SourceType || "",
				Vendor: oItem.Vendor || "",
				VendorDesc: oItem.VendorDesc || "",
				Plant: oItem.Plant || "",
				Department: oItem.Department || "",
				PurchaseOrder: oItem.PurchaseOrder || "",
				RGPNumber: oItem.RGPNumber || "",
				DCNumber: oItem.DCNumber || "",
				DCdate: oItem.DCdate || "",
				GatepassNo: oItem.GatepassNo || "",
				BudgetCode: oItem.BudgetCode || "",
				TotalCost: oItem.TotalCost || "0.00",
				RRNo: oItem.RRNo || "",
				InspectionStatus: oItem.InspectionStatus || "",
				Inspectiondate: oItem.Inspectiondate || "",
				Remarks: oItem.Remarks || "",
				PCPItmNav: { results: aMergedItems.length > 0 ? aMergedItems : ((oItem.PCPItmNav && oItem.PCPItmNav.results) || []) }
			}), "selectedGateEntry");
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onPrintList: function () {
			var oTable = this.byId("idInspectionTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("inspList").getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Gate Entry List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Gate Entry List</h2><table><thead><tr>";
			sHtml += "<th>GE Date</th><th>GE No</th><th>Supplier</th><th>Source Type</th><th>Dept</th><th>RGP No</th><th>Inv No</th><th>RR No</th><th>Gate Pass No</th><th>Inspection Status</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				sHtml += "<tr>";
				sHtml += "<td>" + (o.GEDate || "") + "</td>";
				sHtml += "<td>" + (o.GateEntryNo || "") + "</td>";
				sHtml += "<td>" + (o.VendorDesc || "") + "</td>";
				sHtml += "<td>" + (o.SourceType || "") + "</td>";
				sHtml += "<td>" + (o.Department || "") + "</td>";
				sHtml += "<td>" + (o.RGPNumber || "") + "</td>";
				sHtml += "<td>" + (o.DCNumber || "") + "</td>";
				sHtml += "<td>" + (o.RRNo || "") + "</td>";
				sHtml += "<td>" + (o.GatepassNo || "") + "</td>";
				sHtml += "<td>" + (o.InspectionStatus || "") + "</td>";
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
			var oTable = this.byId("idInspectionTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("inspList").getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["GE Date", "GE No", "Supplier", "Source Type", "Dept", "RGP No", "Inv No", "RR No", "Gate Pass No", "Inspection Status"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				aLines.push([
					o.GEDate || "",
					o.GateEntryNo || "",
					o.VendorDesc || "",
					o.SourceType || "",
					o.Department || "",
					o.RGPNumber || "",
					o.DCNumber || "",
					o.RRNo || "",
					o.GatepassNo || "",
					o.InspectionStatus || ""
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
