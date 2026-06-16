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
			this.getRouter().getRoute("GatePassWithPOEdit").attachPatternMatched(this._onRouteMatchedEdit, this);
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
			if (!oModel) { return; }

			oModel.setProperty("/SourceType", "PO");
			oModel.setProperty("/PurchaseOrder", sPoNumber);
			oModel.setProperty("/Plant", sPlant);

			// Use pre-loaded row data from POList — avoids SAP filter bug where backend
			// ignores PurchaseOrder filter and returns wrong first record
			var oCoreModel = sap.ui.getCore().getModel("selectedPO");
			if (oCoreModel) {
				var oCoreData = oCoreModel.getData();
				sap.ui.getCore().setModel(null, "selectedPO");
				if (oCoreData) {
					if (oCoreData.Vendor) { oModel.setProperty("/Vendor", oCoreData.Vendor); }
					if (oCoreData.VendorDesc) { oModel.setProperty("/VendorDesc", oCoreData.VendorDesc); }
					oModel.setProperty("/Department", oCoreData.Department || "");
					var aNavItems = (oCoreData.GateInPoNav && oCoreData.GateInPoNav.results) || [];
					var aItems = aNavItems.map(function (item, idx) {
						var sItemNo = item.ItemNo || String((idx + 1) * 10);
						if (/^0+\d+$/.test(sItemNo)) { sItemNo = String(parseInt(sItemNo, 10)); }
						return {
							ItemNo: sItemNo,
							ItemDescription: item.ItemDescription || "",
							POQuantity: item.POQuantity || "0.000",
							RecievedQuantity: item.RecievedQuantity || "0.000",
							UOM: item.UOM || "",
							PurchaseOrder: item.PurchaseOrder || sPoNumber,
							Plant: item.Plant || sPlant,
							GatePassNo: item.GatePassNo || ""
						};
					});
					oModel.setProperty("/GateInPoNav", aItems);
					return;
				}
			}

			// Fallback: fetch from OData if core model is not available
			this._fetchPODetails(sPoNumber, sPlant);
		},

		_onRouteMatchedEdit: function (oEvent) {
			this._resetModel();
			var oArgs = oEvent.getParameter("arguments");
			var sGateEntryNo = oArgs.gateEntryNo;
			var sGeDate = oArgs.geDate;
			var sSourceType = oArgs.sourceType;
			var sMode = oArgs.mode;

			var oODataModel = this.getOwnerComponent().getModel();
			var oModel = this.getView().getModel("gpo");
			if (!oODataModel || !oModel) { return; }

			var parseDate = function (vDate) {
				if (!vDate) return "";
				if (vDate instanceof Date) {
					return isNaN(vDate.getTime()) ? "" : vDate.toISOString().split("T")[0];
				}
				if (typeof vDate === "string") {
					var oTsMatch = vDate.match(/\/Date\((\d+)[^)]*\)\//);
					if (oTsMatch) {
						var oD = new Date(parseInt(oTsMatch[1], 10));
						return isNaN(oD.getTime()) ? "" : oD.toISOString().split("T")[0];
					}
					if (/^\d{8}$/.test(vDate)) {
						return vDate === "00000000" ? "" : vDate.substring(0, 4) + "-" + vDate.substring(4, 6) + "-" + vDate.substring(6, 8);
					}
				}
				return vDate;
			};

			var safeTrim = function (vVal) {
				return (vVal === null || vVal === undefined) ? "" : String(vVal).trim();
			};

			var fetchPOItems = function (sPO, sPlant) {
				sap.ui.core.BusyIndicator.show(0);
				oODataModel.read("/GateInPoHdrSet", {
					filters: [
						new sap.ui.model.Filter("PurchaseOrder", sap.ui.model.FilterOperator.EQ, sPO),
						new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant)
					],
					urlParameters: { "$expand": "GateInPoNav" },
					success: function (oPoData) {
						sap.ui.core.BusyIndicator.hide();
						var oPoResult = (oPoData && oPoData.results && oPoData.results.length > 0) ? oPoData.results[0] : null;
						if (oPoResult && oPoResult.GateInPoNav && oPoResult.GateInPoNav.results && oPoResult.GateInPoNav.results.length > 0) {
							var aPoItems = oPoResult.GateInPoNav.results.map(function (item, idx) {
								var sItemNo = item.ItemNo || item.Itemno || item.PurchaseOrderItem || item.POItem || "";
								if (!sItemNo) { sItemNo = String((idx + 1) * 10); }
								if (/^0+\d+$/.test(sItemNo)) { sItemNo = String(parseInt(sItemNo, 10)); }
								return {
									ItemNo: sItemNo,
									ItemDescription: item.ItemDescription || "",
									POQuantity: item.POQuantity || item.RecievedQuantity || "0.000",
									RecievedQuantity: item.RecievedQuantity || item.POQuantity || "0.000",
									UOM: item.UOM || "",
									PurchaseOrder: item.PurchaseOrder || sPO,
									Plant: item.Plant || sPlant,
									GatePassNo: item.GatePassNo || ""
								};
							});
							oModel.setProperty("/GateInPoNav", aPoItems);
						}
					},
					error: function () { sap.ui.core.BusyIndicator.hide(); }
				});
			};

			var applyData = function (oRaw) {
				var sRawSourceType = safeTrim(oRaw.SourceType || "PO");
				var bIsPO = sRawSourceType === "PO" || sRawSourceType === "PO_RGP" || sRawSourceType === "FREE" || sRawSourceType === "SERVICE" || sRawSourceType === "STAFF_WELFARE";
				var sPO = safeTrim(oRaw.PurchaseOrder || oRaw.Purchaseorder || oRaw.GatePassreqNo || "");
				var sPlant = safeTrim(oRaw.Plant);

				var aExistingItems = (oRaw.PCPItmNav && oRaw.PCPItmNav.results) || [];
				var aMapped = aExistingItems.map(function (it, idx) {
					return {
						ItemNo: it.ItemNo || String((idx + 1) * 10).padStart(5, "0"),
						ItemDescription: it.ItemDescription || "",
						POQuantity: it.POQuantity || it.RecievedQuantity || "0.000",
						RecievedQuantity: it.RecievedQuantity || it.POQuantity || "0.000",
						UOM: it.UOM || "",
						PurchaseOrder: it.PurchaseOrder || sPO
					};
				});

				oModel.setData({
					GEDate: parseDate(oRaw.GEDate),
					SourceType: sRawSourceType,
					Vendor: safeTrim(oRaw.Vendor),
					VendorDesc: safeTrim(oRaw.VendorDesc || oRaw.VendorName),
					Plant: sPlant,
					Department: safeTrim(oRaw.Department),
					PurchaseOrder: sPO,
					RGPNumber: safeTrim(oRaw.RGPNumber),
					DCNumber: safeTrim(oRaw.DCNumber),
					DCdate: parseDate(oRaw.DCdate),
					PCPNo: safeTrim(oRaw.GatepassNo || oRaw.PCPNo || oRaw.PcpNo || oRaw.GatePassNo),
					BudgetCode: safeTrim(oRaw.BudgetCode),
					TotalCost: safeTrim(oRaw.TotalCost || "0.00"),
					RRNo: safeTrim(oRaw.RRNo),
					InspectionStatus: safeTrim(oRaw.InspectionStatus || "Pending"),
					Inspectiondate: parseDate(oRaw.Inspectiondate),
					Remarks: safeTrim(oRaw.Remarks),
					GateEntryNo: safeTrim(oRaw.GateEntryNo),
					GatePassNo: safeTrim(oRaw.GatepassNo || oRaw.GatePassNo || oRaw.PCPNo || oRaw.PcpNo),
					GateInPoNav: aMapped,
					isExisting: true,
					isEditMode: sMode === "EDIT"
				});

				// If RRNo is missing from gate entry data, fetch it from the PO header without touching items
				if (!safeTrim(oRaw.RRNo) && sPO && sPlant) {
					oODataModel.read("/GateInPoHdrSet", {
						filters: [
							new sap.ui.model.Filter("PurchaseOrder", sap.ui.model.FilterOperator.EQ, sPO),
							new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant)
						],
						success: function (oPoData) {
							var oPoHdr = (oPoData.results && oPoData.results.length > 0) ? oPoData.results[0] : null;
							if (oPoHdr && oPoHdr.RRNo) {
								oModel.setProperty("/RRNo", oPoHdr.RRNo);
							}
						},
						error: function () {}
					});
				}

				// Fallback: if no saved items found, prefer fetching from PCPHdrSet (actual gate entry items)
				// Only fall back to GateInPoHdrSet (PO items) when no gate pass number exists (new entry)
				if (aMapped.length === 0) {
					var sGPN = safeTrim(oRaw.GatepassNo || oRaw.GatePassNo || oRaw.GateEntryNo || "");
					if (sGPN) {
						sap.ui.core.BusyIndicator.show(0);
						oODataModel.read("/PCPHdrSet", {
							filters: [new sap.ui.model.Filter("GatepassNo", sap.ui.model.FilterOperator.EQ, sGPN)],
							urlParameters: { "$expand": "PCPItmNav" },
							success: function (oPcpData) {
								sap.ui.core.BusyIndicator.hide();
								var aPcpRes = (oPcpData && oPcpData.results) || [];
								var aFetched = [];
								if (aPcpRes.length > 0 && aPcpRes[0].PCPItmNav && aPcpRes[0].PCPItmNav.results) {
									aFetched = aPcpRes[0].PCPItmNav.results.map(function (it, idx) {
										return {
											ItemNo: it.ItemNo || String((idx + 1) * 10).padStart(5, "0"),
											ItemDescription: it.ItemDescription || "",
											POQuantity: it.POQuantity || it.RecievedQuantity || "0.000",
											RecievedQuantity: it.RecievedQuantity || it.POQuantity || "0.000",
											UOM: it.UOM || "",
											PurchaseOrder: it.PurchaseOrder || sPO
										};
									});
								}
								if (aFetched.length > 0) {
									oModel.setProperty("/GateInPoNav", aFetched);
								} else if (bIsPO && sPO && sPlant) {
									fetchPOItems(sPO, sPlant);
								}
							},
							error: function () {
								sap.ui.core.BusyIndicator.hide();
								if (bIsPO && sPO && sPlant) { fetchPOItems(sPO, sPlant); }
							}
						});
					} else if (bIsPO && sPO && sPlant) {
						fetchPOItems(sPO, sPlant);
					}
				}
			};

			// Use pre-loaded data from list navigation (most reliable — avoids SAP filter quirks)
			var oCoreModel = sap.ui.getCore().getModel("selectedGateEntry");
			if (oCoreModel) {
				var oCoreData = oCoreModel.getData();
				sap.ui.getCore().setModel(null, "selectedGateEntry"); // clear so it's never reused
				if (oCoreData) {
					applyData(oCoreData);
					return;
				}
			}

			// Fallback: read from OData (used when navigating directly via URL)
			var aFilters = [new sap.ui.model.Filter("GateEntryNo", sap.ui.model.FilterOperator.EQ, sGateEntryNo)];
			if (sGeDate) { aFilters.push(new sap.ui.model.Filter("GEDate", sap.ui.model.FilterOperator.EQ, sGeDate)); }
			if (sSourceType) { aFilters.push(new sap.ui.model.Filter("SourceType", sap.ui.model.FilterOperator.EQ, sSourceType)); }

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/PCPHdrSet", {
				filters: aFilters,
				urlParameters: { "$expand": "PCPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aResults = oData.results || [];
					if (aResults.length > 0) {
						// Prefer a record with matching SourceType and non-empty PurchaseOrder
						var oResult = aResults[0];
						if (aResults.length > 1) {
							var oBest = aResults.find(function (r) {
								return safeTrim(r.SourceType) === sSourceType && safeTrim(r.PurchaseOrder);
							}) || aResults.find(function (r) {
								return safeTrim(r.PurchaseOrder);
							});
							if (oBest) { oResult = oBest; }
						}
						applyData(oResult);
					} else {
						sap.m.MessageBox.error("Gate Entry record not found: " + sGateEntryNo);
					}
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					sap.m.MessageBox.error("Failed to load Gate Entry details.");
				}
			});
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
			// console.log(sPO);
			// console.log(sPlant);
			
			var aFilters = [
				new Filter("PurchaseOrder", FilterOperator.EQ, sPO),
				new Filter("Plant", FilterOperator.EQ, sPlant)

			];
			// console.log(aFilters)
			

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read(sPath, {
				filters: aFilters,
				urlParameters: {
					"$expand": "GateInPoNav"
				},
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oResultData = (oData && oData.results && oData.results.length > 0) ? oData.results[0] : null;
					// console.log(oResultData);
					if (oResultData) {
						var oModel = this.getView().getModel("gpo");
						if (oResultData.Vendor) { oModel.setProperty("/Vendor", oResultData.Vendor); }
						if (oResultData.VendorDesc) { oModel.setProperty("/VendorDesc", oResultData.VendorDesc); }
						oModel.setProperty("/Department", oResultData.Department || "");
						var sCurrentType = oModel.getProperty("/SourceType");
						if (sCurrentType !== "PO" && sCurrentType !== "PO_RGP" && sCurrentType !== "FREE" && sCurrentType !== "SERVICE" && sCurrentType !== "STAFF_WELFARE") {
							oModel.setProperty("/SourceType", "PO");
						}
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
				oModel.setProperty("/Department", oSelectedPO.Department || "");
				var sCurrentType = oModel.getProperty("/SourceType");
				if (sCurrentType !== "PO" && sCurrentType !== "PO_RGP" && sCurrentType !== "FREE" && sCurrentType !== "SERVICE" && sCurrentType !== "STAFF_WELFARE") {
					oModel.setProperty("/SourceType", "PO");
				}
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
			oModel.setProperty("/GateInPoNav", aItems.slice());
		},

		onPOQuantityInputLiveChange: function (oEvent) {
			var oInput = oEvent.getSource();
			var sVal = oEvent.getParameter("value");
			var sClean = sVal.replace(/[^0-9.]/g, "");
			var aParts = sClean.split(".");
			if (aParts.length > 2) { sClean = aParts[0] + "." + aParts.slice(1).join(""); }
			if (sClean !== sVal) { oInput.setValue(sClean); }
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
			return sSourceType === "PO" || sSourceType === "PO_RGP" || sSourceType === "FREE" || sSourceType === "SERVICE" || sSourceType === "STAFF_WELFARE";
		},

		_isPCPFlow: function () {
			var oModel = this.getView().getModel("gpo");
			var sSourceType = (oModel ? oModel.getProperty("/SourceType") : "") || "";
			sSourceType = sSourceType.toUpperCase().trim();
			return sSourceType === "PETTY CASH" || sSourceType === "PETTYCASH" || sSourceType === "PCP";
		},

		onSubmit: function () {
			var oModel = this.getView().getModel("gpo");
			var oData = oModel.getData();

			if (!oData.GEDate) {
				MessageBox.error("Please enter GE Date.");
				return;
			}
			if (!oData.Plant) {
				MessageBox.error("Please enter Plant.");
				return;
			}
			if (!oData.GateInPoNav || oData.GateInPoNav.length === 0) {
				MessageBox.error("Please add at least one material item.");
				return;
			}

			// Petty Cash specific validation (total cost check)
			var sSourceType = (oData.SourceType || "").toUpperCase().trim();
			var bIsPCP = sSourceType === "PETTY CASH" || sSourceType === "PETTYCASH" || sSourceType === "PCP" || sSourceType === "PETTY_CASH";
			if (bIsPCP) {
				if (!oData.VendorDesc) {
					MessageBox.error("Please enter Vendor Name.");
					return;
				}
				var fTotalCost = parseFloat(oData.TotalCost || 0);
				if (fTotalCost > 5000) {
					MessageBox.error("Total Cost for Petty Cash Purchase cannot exceed 5000.");
					return;
				}
			}

			// Unify payload mapping for all scenarios
			var sPlant = oData.Plant;
			var sPO = oData.PurchaseOrder;

			var aNavItems = oData.GateInPoNav.map(function (oItem, idx) {
				var sQty = oItem.POQuantity || oItem.RecievedQuantity || "0.000";

				var sItemNo = oItem.ItemNo || String((idx + 1) * 10);
				if (/^\d+$/.test(sItemNo)) {
					sItemNo = String(sItemNo).padStart(5, "0");
				}

				return {
					SourceType: oData.SourceType || "PO",
					ItemNo: sItemNo,
					ItemDescription: oItem.ItemDescription || "",
					RecievedQuantity: String(parseFloat(sQty).toFixed(3)),
					UOM: oItem.UOM || "",
					TotalCost: oData.TotalCost ? String(parseFloat(oData.TotalCost).toFixed(2)) : "0.00",
					GateEntryNo: oData.GateEntryNo || ""
				};
			});

			var sGEDate = this._formatDateToSAP(oData.GEDate);
			var sDCDateSAP = oData.DCdate ? this._formatDateToSAP(oData.DCdate) : sGEDate;

			var oPayload = {
				GEDate: sGEDate,
				Plant: sPlant,
				Vendor: oData.Vendor || "",
				VendorDesc: oData.VendorDesc || "",
				SourceType: oData.SourceType || "PO",
				Department: oData.Department || "",
				DCNumber: oData.DCNumber || "",
				PurchaseOrder: sPO || "",
				RRNo: oData.RRNo || "",
				GateEntryNo: oData.GateEntryNo || "",
				GatepassNo: oData.PCPNo || "",
				PCPDate: sGEDate,
				DCdate: sDCDateSAP,
				BudgetCode: oData.BudgetCode || "",
				EntryPoint: "",
				InspectionStatus: oData.InspectionStatus || "",
				Inspectiondate: oData.Inspectiondate ? this._formatDateToSAP(oData.Inspectiondate) : "",
				Remarks: oData.Remarks || "",
				Message: "",
				PCPItmNav: aNavItems
			};

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
						var sMsg = (oResponse && oResponse.Message) ? oResponse.Message : "Gate Entry saved successfully.";
						var oModel = this.getView().getModel("gpo");
						MessageBox.success(sMsg, {
							onClose: function () {
								if (oModel) { oModel.setProperty("/ui/hasPendingChanges", false); }
								this.getRouter().navTo("PCPList");
							}.bind(this)
						});
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

						// Handle standard SAP Gateway "success-error" where entity isn't returned
						var bIsSuccessError = (sErrMsg && sErrMsg.indexOf("Service provider did not return any business data") !== -1) ||
											  (sDetailedError && sDetailedError.indexOf("Service provider did not return any business data") !== -1);

						if (bIsSuccessError) {
							MessageToast.show("Gate Entry processed successfully.");
							this._resetModel();
							return;
						}

						MessageBox.error(sErrMsg + sDetailedError);
					}.bind(this)
				});
			} catch (oSyncError) {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Submission failed: " + (oSyncError.message || oSyncError));
			}
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		},

		onNavBack: function () {
			this.getRouter().navTo("PCPList");
		}

	});
});
