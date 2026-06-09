sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.GatePassWithPO", {

		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("GatePassWithPO").attachPatternMatched(this._onRouteMatched, this);
			this.getRouter().getRoute("GatePassWithPODetail").attachPatternMatched(this._onRouteMatchedDetail, this);
		},

		_onRouteMatched: function () {
			this._resetModel();

			var oModel = this.getView().getModel("gpo");
			if (oModel) {
				var oUserModel = sap.ui.getCore().getModel("user");
				if (oUserModel) {
					var sPlant = oUserModel.getProperty("/Plant");
					var sDept = oUserModel.getProperty("/Department");

					if (sPlant) {
						oModel.setProperty("/Plant", sPlant);
						this._loadVendors(sPlant);
					}
					if (sDept) { oModel.setProperty("/Department", sDept); }
				}
			}
		},

		_onRouteMatchedDetail: function (oEvent) {
			this._onRouteMatched();
			var sPoNumber = oEvent.getParameter("arguments").poNumber;
			var sPlant = oEvent.getParameter("arguments").plant;
			
			var oModel = this.getView().getModel("gpo");
			if (oModel) {
				oModel.setProperty("/SourceType", "PO");
				oModel.setProperty("/PurchaseOrder", sPoNumber);
				oModel.setProperty("/Plant", sPlant);
				
				// Manually trigger the PO change logic to fetch details
				this._fetchPODetails(sPoNumber, sPlant);
			}
		},

		_resetModel: function () {
			var oModel = this.getView().getModel("gpo");
			var oYesterday = new Date();
			oYesterday.setDate(oYesterday.getDate() - 1);
			var sYesterday = oYesterday.getFullYear() + "-" +
				String(oYesterday.getMonth() + 1).padStart(2, "0") + "-" +
				String(oYesterday.getDate()).padStart(2, "0");

			var oData = {
				GEDate: sYesterday,
				SourceType: "",
				Vendor: "",
				VendorDesc: "",
				Plant: "",
				Department: "",
				PurchaseOrder: "",
				RGPNumber: "",
				DCNumber: "",
				DCdate: sYesterday,
				PCPNo: "",
				BudgetCode: "",
				TotalCost: "",
				RRNo: "",
				InspectionStatus: "Pending",
				Inspectiondate: "",
				Remarks: "",
				GateEntryNo: "",
				GatePassNo: "",
				Message: "",
				GateInPoNav: []
			};
			if (!oModel) {
				this.getView().setModel(new JSONModel(oData), "gpo");
			} else {
				oModel.setData(oData);
			}
		},

		_formatDateToSAP: function (sDate) {
			if (!sDate) {
				return "";
			}
			if (typeof sDate === "string" && sDate.length === 8 && !isNaN(sDate)) {
				return sDate;
			}
			var oDate = new Date(sDate);
			if (isNaN(oDate.getTime())) {
				return "";
			}
			var sYear = oDate.getFullYear();
			var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
			var sDay = String(oDate.getDate()).padStart(2, "0");
			return sYear + sMonth + sDay;
		},

		_formatDateToHyphens: function (sDate) {
			if (!sDate) {
				return "";
			}
			var oDate = new Date(sDate);
			if (isNaN(oDate.getTime())) {
				return "";
			}
			var sYear = oDate.getFullYear();
			var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
			var sDay = String(oDate.getDate()).padStart(2, "0");
			return sYear + "-" + sMonth + "-" + sDay;
		},

		onSourceTypeChange: function () {
			// Reserved for source-type-specific logic if needed
		},

		onVendorChange: function () {
			// Reserved for vendor lookup if needed
		},

		onPlantChange: function (oEvent) {
			var sPlant = (oEvent.getParameter("value") || "").trim().toUpperCase();
			var oModel = this.getView().getModel("gpo");
			if (oModel) {
				oModel.setProperty("/Plant", sPlant);
				this._loadVendors(sPlant);
			}
		},

		onVendorSelect: function (oEvent) {
			var oItem = oEvent.getParameter("selectedItem");
			var oModel = this.getView().getModel("gpo");
			if (!oModel) { return; }

			if (!oItem) {
				oModel.setProperty("/VendorDesc", "");
				return;
			}

			var sVendorKey = oItem.getKey();
			var oVendorModel = this.getView().getModel("vendors");
			var aVendors = (oVendorModel) ? oVendorModel.getProperty("/results") : [];
			var oVendor = aVendors.find(function (v) { return v.Vendor === sVendorKey; });
			if (oVendor) {
				oModel.setProperty("/VendorDesc", oVendor.VendorName || "");
			}
		},

		_loadVendors: function (sPlant) {
			var oVendorModel = new JSONModel({ results: [] });
			this.getView().setModel(oVendorModel, "vendors");

			if (!sPlant) { return; }

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var aFilters = [new Filter("Plant", FilterOperator.EQ, sPlant)];

			oODataModel.read("/ZVendorSet", {
				filters: aFilters,
				success: function (oData) {
					var aResults = oData.results || [];
					if (aResults.length === 0) { return; }
					var aNormalized = aResults.map(function (v) {
						return {
							Vendor: v.Vendor || v.Lifnr || "",
							VendorName: v.Name || v.VendorName || v.Name1 || "Unknown Vendor",
							Street: v.Address || v.Street || "",
							City: v.City || "",
							PostalCode: v.ZipCode || v.PostalCode || "",
							Country: v.Country || "",
							VendorGST: v.VendorGST || v.TaxNumber1 || ""
						};
					});
					oVendorModel.setProperty("/results", aNormalized);
				},
				error: function (oError) {
					MessageBox.error("Failed to load vendors. Please try again.");
				}
			});
		},

		onPOChange: function (oEvent) {
			var oModel = this.getView().getModel("gpo");
			var sPO = (oModel.getProperty("/PurchaseOrder") || "").trim();
			var sPlant = (oModel.getProperty("/Plant") || "").trim();

			if (!sPO) {
				return;
			}
			if (!sPlant) {
				MessageToast.show("Please enter Plant first to fetch PO details.");
				return;
			}

			this._fetchPODetails(sPO, sPlant);
		},

		_fetchPODetails: function (sPO, sPlant) {
			var oODataModel = this.getOwnerComponent().getModel();
			var sPath = "/GateInPoHdrSet";
			var aFilters = [
				new Filter("PurchaseOrder", FilterOperator.EQ, sPO),
				new Filter("Plant", FilterOperator.EQ, sPlant)
			];

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read(sPath, {
				filters: aFilters,
				urlParameters: {
					"$expand": "GateInPoNav"
				},
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oResultData = (oData && oData.results && oData.results.length > 0) ? oData.results[0] : null;
					if (oResultData) {
						var oModel = this.getView().getModel("gpo");
						if (oResultData.Vendor) { oModel.setProperty("/Vendor", oResultData.Vendor); }
						if (oResultData.VendorDesc) { oModel.setProperty("/VendorDesc", oResultData.VendorDesc); }
						if (oResultData.Department) { oModel.setProperty("/Department", oResultData.Department); }
						oModel.setProperty("/SourceType", "PO"); // Force source type to PO
						if (oResultData.DCNumber) { oModel.setProperty("/DCNumber", oResultData.DCNumber); }
						if (oResultData.RRNo) { oModel.setProperty("/RRNo", oResultData.RRNo); }
						if (oResultData.GatePassNo) { oModel.setProperty("/GatePassNo", oResultData.GatePassNo); }
						if (oResultData.GateEntryNo) { oModel.setProperty("/GateEntryNo", oResultData.GateEntryNo); }

						if (oResultData.InspectionStatus) {
							oModel.setProperty("/InspectionStatus", oResultData.InspectionStatus);
						}

						if (oResultData.Inspectiondate) {
							// Check if the date is valid before setting, else leave it empty
							var parsedDate = new Date(oResultData.Inspectiondate);
							if (!isNaN(parsedDate.getTime())) {
								var sYear = parsedDate.getFullYear();
								var sMonth = String(parsedDate.getMonth() + 1).padStart(2, "0");
								var sDay = String(parsedDate.getDate()).padStart(2, "0");
								oModel.setProperty("/Inspectiondate", sYear + "-" + sMonth + "-" + sDay);
							}
						}

						// Auto-fill the items table
						var aItems = [];
						if (oResultData.GateInPoNav && oResultData.GateInPoNav.results) {
							aItems = oResultData.GateInPoNav.results.map(function (item, idx) {
								var sItemNo = item.ItemNo || item.Itemno || item.PurchaseOrderItem || item.POItem || "";
								if (!sItemNo) {
									sItemNo = String((idx + 1) * 10);
								}
								if (/^0+\d+$/.test(sItemNo)) {
									sItemNo = String(parseInt(sItemNo, 10));
								}
								return {
									ItemNo: sItemNo,
									ItemDescription: item.ItemDescription || "",
									POQuantity: item.POQuantity || "",
									UOM: item.UOM || "",
									PurchaseOrder: item.PurchaseOrder || sPO,
									Plant: item.Plant || sPlant,
									GatePassNo: item.GatePassNo || "",
									RecievedQuantity: item.RecievedQuantity || ""
								};
							});
						}
						oModel.setProperty("/GateInPoNav", aItems);
						MessageToast.show("PO details loaded successfully.");
					} else {
						MessageToast.show("No PO details found for " + sPO);
					}
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sErrMsg = "Failed to fetch PO details.";
					try {
						var oErrBody = JSON.parse(oError.responseText);
						sErrMsg = oErrBody.error.message.value || sErrMsg;
					} catch (e) { /* ignore */ }
					MessageBox.error(sErrMsg);
				}
			});
		},

		onPOValueHelp: function () {
			var oModel = this.getView().getModel("gpo");
			var sPlant = (oModel.getProperty("/Plant") || "").trim();

			if (!sPlant) {
				MessageToast.show("Please enter Plant first.");
				return;
			}

			if (!this.getView().getModel("pos")) {
				this.getView().setModel(new JSONModel({ results: [] }), "pos");
			}

			if (!this._pPOValueHelp) {
				this._pPOValueHelp = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.POValueHelp",
					controller: this
				}).then(function (oDialog) {
					this.getView().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}

			var oODataModel = this.getOwnerComponent().getModel();
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/GateInPoHdrSet", {
				filters: [new Filter("Plant", FilterOperator.EQ, sPlant)],
				urlParameters: { "$expand": "GateInPoNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					this.getView().getModel("pos").setProperty("/results", oData.results || []);
					this._pPOValueHelp.then(function (oDialog) {
						oDialog.getBinding("items").filter([]);
						oDialog.open();
					});
				}.bind(this),
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageToast.show("Failed to load POs for Plant " + sPlant);
				}
			});
		},

		onPOValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new Filter({
				filters: [
					new Filter("PurchaseOrder", FilterOperator.Contains, sValue),
					new Filter("Vendor", FilterOperator.Contains, sValue),
					new Filter("VendorDesc", FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onPOValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedPO = oSelectedItem.getBindingContext("pos").getObject();
			var oModel = this.getView().getModel("gpo");

			if (oSelectedPO) {
				oModel.setProperty("/PurchaseOrder", oSelectedPO.PurchaseOrder || "");
				oModel.setProperty("/Vendor", oSelectedPO.Vendor || "");
				oModel.setProperty("/VendorDesc", oSelectedPO.VendorDesc || "");
				if (oSelectedPO.Department) {
					oModel.setProperty("/Department", oSelectedPO.Department);
				}
				oModel.setProperty("/SourceType", "PO"); // Force source type to PO
				oModel.setProperty("/DCNumber", oSelectedPO.DCNumber || "");
				oModel.setProperty("/RRNo", oSelectedPO.RRNo || "");

				if (oSelectedPO.InspectionStatus) {
					oModel.setProperty("/InspectionStatus", oSelectedPO.InspectionStatus);
				}

				if (oSelectedPO.Inspectiondate) {
					var parsedDate = new Date(oSelectedPO.Inspectiondate);
					if (!isNaN(parsedDate.getTime())) {
						var sYear = parsedDate.getFullYear();
						var sMonth = String(parsedDate.getMonth() + 1).padStart(2, "0");
						var sDay = String(parsedDate.getDate()).padStart(2, "0");
						oModel.setProperty("/Inspectiondate", sYear + "-" + sMonth + "-" + sDay);
					}
				}

				// Auto-fill the items table
				var aItems = [];
				if (oSelectedPO.GateInPoNav && oSelectedPO.GateInPoNav.results) {
					aItems = oSelectedPO.GateInPoNav.results.map(function (item, idx) {
						var sItemNo = item.ItemNo || item.Itemno || item.PurchaseOrderItem || item.POItem || "";
						if (!sItemNo) {
							sItemNo = String((idx + 1) * 10);
						}
						if (/^0+\d+$/.test(sItemNo)) {
							sItemNo = String(parseInt(sItemNo, 10));
						}
						return {
							ItemNo: sItemNo,
							ItemDescription: item.ItemDescription || "",
							POQuantity: item.POQuantity || "",
							UOM: item.UOM || "",
							PurchaseOrder: item.PurchaseOrder || oSelectedPO.PurchaseOrder,
							Plant: item.Plant || oSelectedPO.Plant,
							GatePassNo: item.GatePassNo || "",
							RecievedQuantity: item.RecievedQuantity || ""
						};
					});
				}
				oModel.setProperty("/GateInPoNav", aItems);
				MessageToast.show("PO details auto-filled successfully.");
			}
		},

		onPOValueHelpCancel: function () { },

		onAddItem: function () {
			var oModel = this.getView().getModel("gpo");
			var aItems = oModel.getProperty("/GateInPoNav") || [];
			var idx = aItems.length;
			var sNextItemNo = String((idx + 1) * 10);
			aItems.push({
				ItemNo: sNextItemNo,
				ItemDescription: "",
				POQuantity: "",
				UOM: "",
				PurchaseOrder: "",
				Plant: "",
				GatePassNo: "",
				RecievedQuantity: ""
			});
			oModel.setProperty("/GateInPoNav", aItems);
		},

		onDeleteItem: function (oEvent) {
			var oModel = this.getView().getModel("gpo");
			var aItems = oModel.getProperty("/GateInPoNav");
			var oCtx = oEvent.getSource().getBindingContext("gpo");
			var iIdx = parseInt(oCtx.getPath().split("/").pop());
			aItems.splice(iIdx, 1);
			oModel.setProperty("/GateInPoNav", aItems.slice());
		},

		onReset: function () {
			this._resetModel();
		},

		_isPOFlow: function () {
			var oModel = this.getView().getModel("gpo");
			var sSourceType = (oModel ? oModel.getProperty("/SourceType") : "") || "";
			sSourceType = sSourceType.toUpperCase().trim();
			return sSourceType === "PO";
		},

		_isPCPFlow: function () {
			var oModel = this.getView().getModel("gpo");
			var sSourceType = (oModel ? oModel.getProperty("/SourceType") : "") || "";
			sSourceType = sSourceType.toUpperCase().trim();
			return sSourceType === "PETTY CASH" || sSourceType === "PETTYCASH" || sSourceType === "PCP";
		},

		onSubmit: function () {
			if (this._isPOFlow()) {
				this._submitPOFlow();
			} else if (this._isPCPFlow()) {
				this._submitPCPFlow();
			} else {
				// Fallback robustness check: if a PO number is present, treat as PO flow
				var oModel = this.getView().getModel("gpo");
				if (oModel && oModel.getProperty("/PurchaseOrder")) {
					this._submitPOFlow();
				} else {
					MessageBox.error("Please select a Source Type (PO or Petty Cash) before submitting.");
				}
			}
		},

		// =========================================================================
		// PO Workflow Implementation Methods
		// =========================================================================

		_validatePO: function (oData) {
			if (!oData.GEDate) {
				MessageBox.error("Please enter GE Date.");
				return false;
			}
			if (!oData.Plant) {
				MessageBox.error("Please enter Plant.");
				return false;
			}
			if (!oData.Department) {
				MessageBox.error("Please enter Department.");
				return false;
			}
			if (!oData.GateInPoNav || oData.GateInPoNav.length === 0) {
				MessageBox.error("Please add at least one item.");
				return false;
			}
			return true;
		},

		_preparePOPayload: function (oData) {
			var sPlant = oData.Plant;
			var sPO = oData.PurchaseOrder;

			var aNavItems = oData.GateInPoNav.map(function (oItem) {
				return {
					PurchaseOrder: sPO || "",
					Plant: sPlant,
					ItemNo: oItem.ItemNo || "",
					ItemDescription: oItem.ItemDescription || "",
					POQuantity: oItem.POQuantity ? String(oItem.POQuantity) : "0.000",
					UOM: oItem.UOM || "",
					GatePassNo: "",
					RecievedQuantity: oItem.RecievedQuantity ? String(oItem.RecievedQuantity) : "0.000"
				};
			});

			var sGEDate = this._formatDateToSAP(oData.GEDate);
			var sInspectionDate = this._formatDateToSAP(oData.Inspectiondate);

			return {
				PurchaseOrder: sPO || "",
				Plant: sPlant,
				SourceType: oData.SourceType || "PO",
				Vendor: oData.Vendor || "",
				VendorDesc: oData.VendorDesc || "",
				Department: oData.Department || "",
				DCNumber: oData.DCNumber || "",
				RRNo: oData.RRNo || "",
				InspectionStatus: oData.InspectionStatus || "Pending",
				Inspectiondate: sInspectionDate,
				Remarks: oData.Remarks || "",
				GateEntryNo: "",
				GEDate: sGEDate,
				Message: "",
				GateInPoNav: aNavItems
			};
		},

		_submitPOFlow: function () {
			var oModel = this.getView().getModel("gpo");
			var oData = oModel.getData();

			if (!this._validatePO(oData)) {
				return;
			}

			var oPayload = this._preparePOPayload(oData);
			this._executeODataCreate("/GateInPoHdrSet", oPayload);
		},

		// =========================================================================
		// Petty Cash Purchase (PCP) Workflow Implementation Methods
		// =========================================================================

		_validatePCP: function (oData) {
			if (!oData.GEDate) {
				MessageBox.error("Please enter GE Date.");
				return false;
			}
			if (!oData.Plant) {
				MessageBox.error("Please enter Plant.");
				return false;
			}
			if (!oData.Department) {
				MessageBox.error("Please enter Department.");
				return false;
			}
			if (!oData.VendorDesc) {
				MessageBox.error("Please enter Vendor Name.");
				return false;
			}
			var fTotalCost = parseFloat(oData.TotalCost || 0);
			if (fTotalCost > 5000) {
				MessageBox.error("Total Cost for Petty Cash Purchase cannot exceed 5000.");
				return false;
			}
			if (!oData.GateInPoNav || oData.GateInPoNav.length === 0) {
				MessageBox.error("Please add at least one material item.");
				return false;
			}
			return true;
		},

		_preparePCPPayload: function (oData) {
			var sPlant = oData.Plant;
			var sGEDateSAP = this._formatDateToSAP(oData.GEDate);
			var sDCDateSAP = oData.DCdate ? this._formatDateToSAP(oData.DCdate) : sGEDateSAP;

			var aNavItems = oData.GateInPoNav.map(function (oItem, idx) {
				var sQty = oItem.RecievedQuantity || oItem.POQuantity || "0.000";

				var sItemNo = oItem.ItemNo || String((idx + 1) * 10);
				if (/^\d+$/.test(sItemNo)) {
					sItemNo = String(sItemNo).padStart(5, "0");
				}

				return {
					SourceType: "PettyCash",
					ItemNo: sItemNo,
					ItemDescription: oItem.ItemDescription || "",
					RecievedQuantity: String(parseFloat(sQty).toFixed(3)),
					UOM: oItem.UOM || "",
					TotalCost: oData.TotalCost ? String(parseFloat(oData.TotalCost).toFixed(2)) : "0.00",
					GateEntryNo: oData.GateEntryNo || ""
				};
			});

			return {
				GEDate: sGEDateSAP,
				Plant: sPlant,
				Vendor: oData.Vendor || "",
				VendorDesc: oData.VendorDesc || "",
				SourceType: "PettyCash",
				Department: oData.Department || "",
				DCNumber: oData.DCNumber || "",
				PurchaseOrder: oData.PurchaseOrder || "",
				RRNo: oData.RRNo || "",
				GateEntryNo: oData.GateEntryNo || "",
				PCPDate: sGEDateSAP,
				DCdate: sDCDateSAP,
				BudgetCode: oData.BudgetCode || "",
				EntryPoint: "",
				InspectionStatus: "",
				Inspectiondate: "",
				Remarks: oData.Remarks || "",
				Message: "",
				PCPItmNav: aNavItems
			};
		},

		_submitPCPFlow: function () {
			var oModel = this.getView().getModel("gpo");
			var oData = oModel.getData();

			if (!this._validatePCP(oData)) {
				return;
			}

			var oPayload = this._preparePCPPayload(oData);
			this._executeODataCreate("/PCPHdrSet", oPayload);
		},

		// =========================================================================
		// Reusable Core OData Submission Executor
		// =========================================================================

		_executeODataCreate: function (sEntitySet, oPayload) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("OData model not available. Please refresh and try again.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			try {
				oODataModel.create(sEntitySet, oPayload, {
					success: function (oResponse) {
						sap.ui.core.BusyIndicator.hide();
						var sMsg = (oResponse && oResponse.Message) ? oResponse.Message : "Success";
						MessageToast.show(sMsg);
						this._resetModel();
					}.bind(this),
					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sErrMsg = "Failed to create Gate Entry.";
						var sDetailedError = "";
						try {
							var oErrBody = JSON.parse(oError.responseText);
							sErrMsg = (oErrBody.error && oErrBody.error.message && oErrBody.error.message.value) ? oErrBody.error.message.value : sErrMsg;

							if (oErrBody.error && oErrBody.error.innererror) {
								var oInner = oErrBody.error.innererror;
								if (oInner.errordetails && oInner.errordetails.length > 0) {
									var aDetails = oInner.errordetails.map(function (d) {
										return d.message;
									}).filter(Boolean);

									aDetails = aDetails.filter(function (msg) {
										return msg.indexOf("Error_Resolution") === -1 && msg.indexOf("SAP_Note") === -1 && msg.indexOf("/IWFND/ERROR_LOG") === -1;
									});

									if (aDetails.length > 0) {
										sDetailedError = "\n\nBackend details:\n" + aDetails.join("\n");
									}
								}
								if (!sDetailedError && oInner.transactionid) {
									sDetailedError = "\n\nTransaction ID: " + oInner.transactionid;
								}
							}
						} catch (e) {
							if (oError.responseText) {
								sDetailedError = "\n\nResponse details:\n" + oError.responseText;
							} else if (oError.message) {
								sDetailedError = "\n\nDetails: " + oError.message;
							}
						}
						MessageBox.error(sErrMsg + sDetailedError);
					}
				});
			} catch (oSyncError) {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Submission failed: " + (oSyncError.message || oSyncError));
			}
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		}

	});
});
