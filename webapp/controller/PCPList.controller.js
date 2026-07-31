sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.PCPList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ results: [] }), "pcpList");
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
			if (!oODataModel) { return; }

			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = (oUserModel && oUserModel.getProperty("/Plant")) || "";
			var aFilters = sPlant ? [new Filter("Plant", FilterOperator.EQ, sPlant)] : [];

			sap.ui.core.BusyIndicator.show(0);
			var that = this;
			oODataModel.read("/PCPHdrSet", {
				filters: aFilters,
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];

					aResults.forEach(function (oItem) {
						oItem.PCPDate = that._formatSAPDateToDisplay(oItem.PCPDate);
						oItem.GEDate = that._formatSAPDateToDisplay(oItem.GEDate);

						oItem.FirstItemDesc = "";
						if (oItem.PCPItmNav && oItem.PCPItmNav.results && oItem.PCPItmNav.results.length > 0) {
							oItem.FirstItemDesc = oItem.PCPItmNav.results[0].ItemDescription || "";
							oItem.PCPNo = oItem.PCPItmNav.results[0].GatepassNo || oItem.PCPItmNav.results[0].PCPNo || oItem.PurchaseOrder || oItem.GateEntryNo || "";
						} else {
							oItem.PCPNo = oItem.GatepassNo || oItem.PCPNo || oItem.PurchaseOrder || oItem.GateEntryNo || "";
						}
					});

					oView.getModel("pcpList").setProperty("/results", aResults);
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load Gate Entry List.");
					oView.getModel("pcpList").setProperty("/results", []);
				}
			});
		},

		onSearch: function () {
			this._applyFilters();
		},

		onStatusFilterChange: function () {
			this._applyFilters();
		},

		onDateFilter: function () {
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("pcpTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) { return; }

			var aFilters = [];

			// 1. Text Search Filter
			var sQuery = this.byId("pcpTable").getHeaderToolbar().getContent().find(function (c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			}).getValue().trim();

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

			// 2. Dropdown Inspection Status Filter
			var sStatus = this.byId("idInspectionStatusFilter").getSelectedKey();
			if (sStatus) {
				aFilters.push(new Filter("InspectionStatus", FilterOperator.EQ, sStatus));
			}

			// 3. Date Range Filter
			var sFrom = this.byId("idFilterFromDate").getDateValue();
			var sTo = this.byId("idFilterToDate").getDateValue();
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

		onClearDateFilter: function () {
			this.byId("idFilterFromDate").setDateValue(null);
			this.byId("idFilterToDate").setDateValue(null);
			this.byId("idInspectionStatusFilter").setSelectedKey("");
			var oSearchField = this.byId("pcpTable").getHeaderToolbar().getContent().find(function (c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			});
			if (oSearchField) { oSearchField.setValue(""); }
			this._applyFilters();
		},

		_formatSAPDateToDisplay: function (vDate) {
			if (!vDate) { return ""; }
			var dDate;
			if (vDate instanceof Date) {
				dDate = vDate;
			} else if (typeof vDate === "string") {
				var oTsMatch = vDate.match(/\/Date\((\d+)[^)]*\)\//);
				if (oTsMatch) {
					dDate = new Date(parseInt(oTsMatch[1], 10));
				} else if (/^\d{8}$/.test(vDate)) {
					if (/^0+$/.test(vDate)) { return ""; }
					dDate = new Date(vDate.substring(0, 4) + "-" + vDate.substring(4, 6) + "-" + vDate.substring(6, 8));
				} else {
					dDate = new Date(vDate);
				}
			}
			if (dDate && !isNaN(dDate.getTime())) {
				return String(dDate.getDate()).padStart(2, "0") + "-" +
					String(dDate.getMonth() + 1).padStart(2, "0") + "-" +
					dDate.getFullYear();
			}
			return vDate;
		},

		onSort: function () {
			this._openSortDialog("pcpTable", [
				{ key: "GEDate", text: "GE Date", selected: true },
				{ key: "GateEntryNo", text: "GE No" },
				{ key: "VendorDesc", text: "Supplier" },
				{ key: "SourceType", text: "Source Type" },
				{ key: "Department", text: "Dept" },
				{ key: "RGPNumber", text: "RGP No" },
				{ key: "DCNumber", text: "Inv No" },
				{ key: "RRNo", text: "RR No" },
				{ key: "GatepassNo", text: "Gate Pass No" },
				{ key: "InspectionStatus", text: "Inspection Status" }
			]);
		},

		onFilter: function () {
			if (!this._oFilterDialog) {
				var sapM = sap.ui.require("sap/m/ViewSettingsDialog");
				var sapFilter = sap.ui.require("sap/m/ViewSettingsFilterItem");
				var sapItem = sap.ui.require("sap/m/ViewSettingsItem");
				this._oFilterDialog = new sapM({
					confirm: function (oEvent) {
						var aFilterItems = oEvent.getParameter("filterItems");
						var aFilters = [];
						aFilterItems.forEach(function(oItem) {
							var sPath = oItem.getParent().getKey();
							var sValue = oItem.getKey();
							aFilters.push(new Filter(sPath, FilterOperator.EQ, sValue));
						});
						var oTable = this.getView().byId("pcpTable");
						// Combine with search filter if exists
						var oBinding = oTable.getBinding("items");
						oBinding.filter(aFilters);
					}.bind(this)
				});
				var oDateFilter = new sapFilter({ key: "PCPDate", text: "PCP Date", multiSelect: true });
				// Will dynamically populate filter items before opening
				this._oFilterDialog.addFilterItem(oDateFilter);
				this.getView().addDependent(this._oFilterDialog);
			}
			
			// Dynamically populate distinct dates for filter
			var oListModel = this.getView().getModel("pcpList");
			var aData = oListModel ? (oListModel.getProperty("/results") || []) : [];
			var aUniqueDates = [...new Set(aData.map(function(item) { return item.PCPDate; }))].filter(Boolean);
			var oDateFilter = this._oFilterDialog.getFilterItems()[0];
			oDateFilter.removeAllItems();
			var sapItem = sap.ui.require("sap/m/ViewSettingsItem");
			aUniqueDates.forEach(function(date) {
				oDateFilter.addItem(new sapItem({ key: date, text: date }));
			});

			this._oFilterDialog.open();
		},

		onDownloadExcel: function () {
			var oTable = this.byId("pcpTable");
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
				aData = this.getView().getModel("pcpList").getProperty("/results") || [];
			}
			var dFrom = this.byId("idFilterFromDate").getDateValue();
			var dTo = this.byId("idFilterToDate").getDateValue();
			aData = ExcelExport.filterByDate(aData, "GEDate", dFrom, dTo);
			if (!aData.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}

			var fmtD = function (v) {
				if (!v) { return ""; }
				if (v instanceof Date) {
					if (isNaN(v.getTime())) { return ""; }
					return v.getDate().toString().padStart(2, "0") + "-" + (v.getMonth() + 1).toString().padStart(2, "0") + "-" + v.getFullYear();
				}
				if (typeof v === "string") {
					var m = v.match(/\/Date\((\d+)/);
					if (m) { return fmtD(new Date(parseInt(m[1], 10))); }
					if (/^\d{8}$/.test(v) && !/^0+$/.test(v)) {
						return v.slice(6, 8) + "-" + v.slice(4, 6) + "-" + v.slice(0, 4);
					}
				}
				return v;
			};

			var aRows = [];
			aData.forEach(function (o) {
				var aItems = (o.PCPItmNav && (o.PCPItmNav.results || o.PCPItmNav)) || [];
				if (!Array.isArray(aItems)) { aItems = []; }
				if (aItems.length === 0) {
					aRows.push({
						"PCP No": o.GatepassNo || "",
						"PCP Date": fmtD(o.PCPDate),
						"Entry": o.EntryPoint || "",
						"GE No": o.GateEntryNo || "",
						"GE Date": fmtD(o.GEDate),
						"Dept": o.Department || "",
						"Supplier": o.VendorDesc || "",
						"Items": o.FirstItemDesc || "",
						"Qty": "",
						"UOM": "",
						"DC/INV No": o.DCNumber || "",
						"DC/INV Date": fmtD(o.DCdate),
						"Total cost": o.TotalCost || "",
						"Budget": o.BudgetCode || ""
					});
				} else {
					aItems.forEach(function (itm) {
						aRows.push({
							"PCP No": o.GatepassNo || "",
							"PCP Date": fmtD(o.PCPDate),
							"Entry": o.EntryPoint || "",
							"GE No": o.GateEntryNo || "",
							"GE Date": fmtD(o.GEDate),
							"Dept": o.Department || "",
							"Supplier": o.VendorDesc || "",
							"Items": itm.ItemDescription || itm.Description || itm.MaterialDesc || o.FirstItemDesc || "",
							"Qty": itm.OrderQuantity || itm.Quantity || itm.SentQuantity || "",
							"UOM": itm.UOM || itm.uom || itm.Uom || "",
							"DC/INV No": o.DCNumber || "",
							"DC/INV Date": fmtD(o.DCdate),
							"Total cost": itm.TotalCost || o.TotalCost || "",
							"Budget": o.BudgetCode || ""
						});
					});
				}
			});
			var aParts = ["Gate_Entry"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", aRows.length ? Object.keys(aRows[0]).length : 14);
		},

		// ==========================================================
		// POPUP LOGIC
		// ==========================================================

		onAddPCP: function () {
			this.getRouter().navTo("GatePassWithPO");
		},

		onViewPCP: function (oEvent) {
			var oRowCtx = oEvent.getSource().getBindingContext("pcpList");
			var oItem = oRowCtx.getObject();
			var sGeDate = this._toSAPDate(oItem.GEDate);
			this._storeNavEntry(oItem, sGeDate);
			this.getRouter().navTo("GatePassWithPOEdit", {
				gateEntryNo: oItem.GateEntryNo,
				geDate: sGeDate,
				sourceType: oItem.SourceType || "PO",
				mode: "VIEW"
			});
		},

		onEditPCP: function (oEvent) {
			var oRowCtx = oEvent.getSource().getBindingContext("pcpList");
			var oItem = oRowCtx.getObject();
			var sGeDate = this._toSAPDate(oItem.GEDate);
			this._storeNavEntry(oItem, sGeDate);
			this.getRouter().navTo("GatePassWithPOEdit", {
				gateEntryNo: oItem.GateEntryNo,
				geDate: sGeDate,
				sourceType: oItem.SourceType || "PO",
				mode: "EDIT"
			});
		},

		// Store the selected item's raw OData data for the edit form to use directly
		_storeNavEntry: function (oItem, sGEDateRaw) {
			// Prod backend may return one header record per line item — merge all items for same GateEntryNo
			var aAllResults = this.getView().getModel("pcpList").getProperty("/results") || [];
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
				var oSubmitBtn = this.getView().byId("btnSubmitPCP");
				if (oSubmitBtn) {
					oSubmitBtn.setVisible(!bIsView);
				}

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
					TotalCost: "",
					isView: false
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
					TotalCost: oSourceData.TotalCost || "0",
					PurchaseOrder: oSourceData.PurchaseOrder || "",
					RGPNumber: oSourceData.RGPNumber || "",
					PCPNo: oSourceData.GatepassNo || oSourceData.PCPNo || "",
					RRNo: oSourceData.RRNo || "",
					Remarks: oSourceData.Remarks || "",
					InspectionStatus: oSourceData.InspectionStatus || "",
					Inspectiondate: formatBack(oSourceData.Inspectiondate || ""),
					isView: sMode === "VIEW"
				};

				if (oSourceData.PCPItmNav && oSourceData.PCPItmNav.results && oSourceData.PCPItmNav.results.length > 0) {
					oData.RecievedQuantity = oSourceData.PCPItmNav.results[0].RecievedQuantity || "0.00";
					oData.UOM = this._mapUOMToDropdownKey(oSourceData.PCPItmNav.results[0].UOM || oSourceData.PCPItmNav.results[0].uom || oSourceData.PCPItmNav.results[0].Uom || "");
					oData.ItemNo = oSourceData.PCPItmNav.results[0].ItemNo || "";
				}
			}

			var oModel = this.getView().getModel("pcpModel");
			if (!oModel) {
				this.getView().setModel(new JSONModel(oData), "pcpModel");
			} else {
				oModel.setData(oData);
			}

			this._loadBudgetCodes();
		},

		_loadBudgetCodes: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var that = this;
			oODataModel.read("/ZWBSElementSet", {
				success: function (oData) {
					var aResults = oData.results || [];
					var oModel = that.getView().getModel("pcpModel");
					if (oModel) {
						var oDropdowns = oModel.getProperty("/dropdowns") || {};
						oDropdowns.budgetCodes = aResults;
						oModel.setProperty("/dropdowns", oDropdowns);
					}
				},
				error: function (oError) {
					console.error("Failed to load budget codes from /ZWBSElementSet", oError);
				}
			});
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
			var aFilters = [new Filter("GateEntryNo", FilterOperator.EQ, sGE)];
			
			var sModelDate = (oPcpModel.getProperty("/GEDate") || "").trim();
			if (sModelDate) {
				var sGEDate = "";
				var aParts = sModelDate.split("-");
				if (aParts.length === 3) {
					if (aParts[0].length === 4) { // YYYY-MM-DD
						sGEDate = aParts[0] + aParts[1] + aParts[2];
					} else if (aParts[2].length === 4) { // DD-MM-YYYY
						sGEDate = aParts[2] + aParts[1] + aParts[0];
					}
				} else {
					sGEDate = sModelDate.replace(/-/g, "");
				}
				if (sGEDate) {
					aFilters.push(new Filter("GEDate", FilterOperator.EQ, sGEDate));
				}
			}

			// Fetch the PCP Data based on GE No and Date
			var sPath = "/PCPHdrSet";
			oODataModel.read(sPath, {
				filters: aFilters,
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
						if (oResult.GEDate) {
							var gd;
							var oTsMatch = typeof oResult.GEDate === "string" && oResult.GEDate.match(/\/Date\((\d+)[^)]*\)\//);
							if (oTsMatch) {
								gd = new Date(parseInt(oTsMatch[1], 10));
							} else if (typeof oResult.GEDate === "string" && /^\d{8}$/.test(oResult.GEDate)) {
								gd = new Date(oResult.GEDate.substring(0, 4) + "-" + oResult.GEDate.substring(4, 6) + "-" + oResult.GEDate.substring(6, 8));
							} else {
								gd = new Date(oResult.GEDate);
							}
							if (gd && !isNaN(gd.getTime())) {
								oPcpModel.setProperty("/GEDate", gd.getFullYear() + "-" + String(gd.getMonth() + 1).padStart(2, "0") + "-" + String(gd.getDate()).padStart(2, "0"));
							}
						}
						if (oResult.DCdate) {
							var pd = new Date(oResult.DCdate);
							if (!isNaN(pd.getTime())) oPcpModel.setProperty("/DCdate", pd.getFullYear() + "-" + String(pd.getMonth() + 1).padStart(2, "0") + "-" + String(pd.getDate()).padStart(2, "0"));
						}
						if (oResult.PCPItmNav && oResult.PCPItmNav.results && oResult.PCPItmNav.results.length > 0) {
							var oItem = oResult.PCPItmNav.results[0];
							oPcpModel.setProperty("/ItemDescription", oItem.ItemDescription || "");
							oPcpModel.setProperty("/RecievedQuantity", oItem.RecievedQuantity || "0.00");
							oPcpModel.setProperty("/UOM", this._mapUOMToDropdownKey(oItem.UOM || oItem.uom || oItem.Uom || ""));
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

		// Convert display date (DD-MM-YYYY) back to SAP format (YYYYMMDD)
		_toSAPDate: function (sDisplayDate) {
			if (!sDisplayDate) return "";
			var aParts = sDisplayDate.split("-");
			if (aParts.length === 3 && aParts[0].length === 2) {
				return aParts[2] + aParts[1] + aParts[0];
			}
			return sDisplayDate;
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

			var sTodaySAP = this._formatDateToSAP(new Date().toISOString().split("T")[0]);

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
				InspectionStatus: "Completed",
				Inspectiondate: sTodaySAP,
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
				oData.UOM = this._mapUOMToDropdownKey(oSourceData.PCPItmNav.results[0].UOM || oSourceData.PCPItmNav.results[0].uom || oSourceData.PCPItmNav.results[0].Uom || "");
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
		},

		onPrintList: function () {
			var oTable = this.byId("pcpTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("pcpList").getProperty("/results") || [];
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
			var oTable = this.byId("pcpTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("pcpList").getProperty("/results") || [];
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
		},

		_mapUOMToDropdownKey: function (sUom) {
			if (!sUom) return "";
			var sClean = sUom.trim().toUpperCase();
			if (sClean === "NO" || sClean === "NO." || sClean === "NOS" || sClean === "EA" || sClean === "PC" || sClean === "ST" || sClean === "NUMBER" || sClean === "NUM") {
				return "Number";
			}
			if (sClean === "KG" || sClean === "KGS" || sClean === "KILOGRAM") {
				return "Kilogram";
			}
			if (sClean === "M" || sClean === "MTR" || sClean === "METERS" || sClean === "METER") {
				return "Meters";
			}
			if (sClean === "MT" || sClean === "TON" || sClean === "TONS" || sClean === "METRIC TONS") {
				return "Metric Tons";
			}
			if (sClean === "FT" || sClean === "FEET") {
				return "Feet";
			}
			if (sClean === "L" || sClean === "LTR" || sClean === "LITRE" || sClean === "LITRES") {
				return "Litre";
			}
			if (sClean === "SET" || sClean === "SETS") {
				return "Set";
			}
			if (sClean === "ROL" || sClean === "ROLL" || sClean === "ROLLS") {
				return "Roll";
			}
			if (sClean === "BOX" || sClean === "BOXES") {
				return "Box";
			}
			if (sClean === "BAG" || sClean === "BAGS") {
				return "Bag";
			}
			return sUom.charAt(0).toUpperCase() + sUom.slice(1).toLowerCase();
		}

	});
});
