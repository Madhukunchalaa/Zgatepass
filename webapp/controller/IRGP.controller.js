sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
	"use strict";

	// OData Status  →  internal StatusCode used by the view's filters/bindings
	var STATUS_MAP = {
		"Open":                 "PENDING_RESERVATION",
		"Reservation Linked":   "PENDING_RECEIPT",
		"Closed":               "CLOSED"
	};
	// Reverse: internal StatusCode → OData Status
	var STATUS_REVERSE = {
		"PENDING_RESERVATION":  "Open",
		"PENDING_RECEIPT":      "Reservation Linked",
		"CLOSED":               "Closed"
	};

	return Controller.extend("zgpms.meilpower.com.controller.IRGP", {

		// =========================================================================
		// Lifecycle
		// =========================================================================

		onInit: function () {
			this._getRouter().getRoute("IRGP").attachPatternMatched(this._onRouteMatched, this);
			this._resetFormModel();
		},

		_onRouteMatched: function (oEvent) {
			var oArgs = oEvent.getParameter("arguments");
			var sStep = oArgs.step ? oArgs.step.toUpperCase() : "CREATE";
			var sGPNo = oArgs.gpNo || "";

			if (sStep === "LIST") {
				this._applyListMode();
				this._loadList();
			} else if (sStep === "CREATE") {
				this._resetFormModel();
				this._applyCreateMode();
			} else {
				this._loadDocument(sStep, sGPNo);
			}
		},

		// =========================================================================
		// OData: List
		// =========================================================================

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsUserOnly = oUserModel ? oUserModel.getProperty("/IsGatepassUserOnly") : false;

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.refresh(true, true);
			oODataModel.read("/IRGPHdrSet", {
				urlParameters: { "$expand": "IRGPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					// Map all records and filter out any corrupted ones with empty Gate Pass No
					var aAll = (oData.results || [])
						.map(this._mapODataToDoc.bind(this))
						.filter(function (d) { return d.IRGPNo && d.IRGPNo.trim() !== ""; });

					// User role sees only Pending Reservation items;
					// once MRN is linked the backend status changes and they fall off.
					var aDocs = bIsUserOnly
						? aAll.filter(function (d) { return d.StatusCode === "PENDING_RESERVATION"; })
						: aAll;

					var oGlobalModel = this.getOwnerComponent().getModel("irgpGlobal");
					if (oGlobalModel) {
						oGlobalModel.setProperty("/documents", aDocs);
					}
				}.bind(this),
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load IRGP list from backend.");
				}
			});
		},

		// =========================================================================
		// OData: Load Single Document
		// =========================================================================

		_loadDocument: function (sStep, sGPNo) {
			if (!sGPNo || sGPNo === "ALL") { return; }

			// 1. Try to serve from the already-loaded list cache first (fast path)
			var oGlobalModel = this.getOwnerComponent().getModel("irgpGlobal");
			var aCached = oGlobalModel ? (oGlobalModel.getProperty("/documents") || []) : [];
			var oCached = aCached.find(function (d) { return d.IRGPNo === sGPNo; });
			if (oCached) {
				this._applyDocToView(oCached, sStep);
				return;
			}

			// 2. Fallback: read from OData with filter (avoids key-format issues)
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/IRGPHdrSet", {
				filters: [new sap.ui.model.Filter("GatePassNo", sap.ui.model.FilterOperator.EQ, sGPNo)],
				urlParameters: { "$expand": "IRGPItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oResult = oData.results && oData.results[0];
					if (!oResult) {
						MessageBox.error("No IRGP record found for: " + sGPNo);
						return;
					}
					this._applyDocToView(this._mapODataToDoc(oResult), sStep);
				}.bind(this),
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load IRGP document: " + sGPNo);
				}
			});
		},

		_applyDocToView: function (oDoc, sStep) {
			var oData = JSON.parse(JSON.stringify(oDoc)); // deep clone
			oData.dropdowns = this._getDefaultDropdowns();
			oData.ui = this._buildUIFlags(sStep);
			// wrap header fields so the form binding path (/header/...) works
			if (!oData.header) {
				oData.header = {
					IRGPNo:               oData.IRGPNo               || "",
					GEDate:               oData.GEDate               || "",
					DueDate:              oData.DueDate              || "",
					RevisedDueDate:       oData.RevisedDueDate       || "",
					ReturnedDate:         oData.ReturnedDate         || "",
					Department:           oData.Department           || "",
					RequestUser:          oData.RequestUser          || "",
					ReturnUser:           oData.ReturnUser           || "",
					ContractName:         oData.ContractName         || "",
					ContractEmployeeName: oData.ContractEmployeeName || "",
					RequestType:          oData.RequestType          || "IRGP",
					Remarks:              oData.Remarks              || "",
					MRNumber:             oData.MRNumber             || "",
					StatusCode:           oData.StatusCode           || "",
					Message:              oData.Message              || ""
				};
			}
			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "irgp");
			this._applyModeForStep(sStep);
		},

		// =========================================================================
		// OData: Create (Submit new IRGP)
		// =========================================================================

		onSubmit: function () {
			var oModel = this.getView().getModel("irgp");
			var oHeader = oModel.getProperty("/header");
			var aItems  = oModel.getProperty("/items");

			if (!oHeader.Department)           { MessageBox.error("Please enter Department."); return; }
			if (!oHeader.ContractName)         { MessageBox.error("Please enter Contract Vendor Name."); return; }
			if (!oHeader.ContractEmployeeName) { MessageBox.error("Please enter Responsible Person Name."); return; }
			if (!oHeader.DueDate)              { MessageBox.error("Please enter Expected Due Date."); return; }
			if (!aItems || aItems.length === 0){ MessageBox.error("Please add at least one material item."); return; }

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var oPayload = {
				GatePassNo:      "",
				RequestDate:     oHeader.GEDate || new Date().toISOString().split("T")[0],
				DueDate:         oHeader.DueDate,
				Department:      oHeader.Department,
				RequestedUser:   oHeader.RequestUser  || "",
				ContractName:    oHeader.ContractName,
				TAQAEmployee:    oHeader.ContractEmployeeName,
				RequestType:     oHeader.RequestType  || "IRGP",
				Remarks:         oHeader.Remarks       || "",
				RevisedDueDate:  oHeader.RevisedDueDate || oHeader.DueDate,
				ReturnedDate:    "",
				ReturnUser:      "",
				MRNumber:        "",
				Status:          "Open",
				Message:         "",
				IRGPItmNav: aItems.map(function (it, i) {
					return {
						GatePassNo:        "",
						ItemNo:            String((i + 1) * 10).padStart(5, "0"),
						ItemCode:          it.ItemCode        || "",
						ItemDescription:   it.ItemDescription || "",
						SentQuantity:      parseFloat(it.SentQuantity || 0).toFixed(3),
						RecievedQuantity:  "0.000",
						BalanceQuantity:   parseFloat(it.SentQuantity || 0).toFixed(3),
						UOM:               it.UOM             || "",
						MRNumber:          "",
						Location:          it.Location        || "",
						Mp2ItmCode:        it.Mp2ItemCode      || "",
						DefaultBin:        it.DefaultBin       || ""
					};
				})
			};

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/IRGPHdrSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var sGPNo = oData.GatePassNo || "";
					MessageBox.success("IRGP " + sGPNo + " created successfully.", {
						onClose: function () {
							oModel.setProperty("/ui/hasPendingChanges", false);
							this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
						}.bind(this)
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error(this._parseODataError(oError, "Failed to create IRGP."));
				}.bind(this)
			});
		},

		// =========================================================================
		// OData: Update — Link MR Reservation Numbers (USER_UPDATE step)
		// =========================================================================

		onSubmitReservation: function () {
			var oModel  = this.getView().getModel("irgp");
			var oHeader = oModel.getProperty("/header");
			var aItems  = oModel.getProperty("/items");

			var bMissingMr = aItems.some(function (it) {
				return !it.MRNumber || it.MRNumber.trim() === "";
			});
			if (bMissingMr) {
				MessageBox.error("Please enter MR/Reservation Number for all items before submitting.");
				return;
			}

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var oPayload = {
				GatePassNo:      oHeader.IRGPNo,
				RequestDate:     oHeader.GEDate || new Date().toISOString().split("T")[0],
				DueDate:         oHeader.DueDate,
				Department:      oHeader.Department,
				RequestedUser:   oHeader.RequestUser || "",
				ContractName:    oHeader.ContractName,
				TAQAEmployee:    oHeader.ContractEmployeeName,
				RequestType:     oHeader.RequestType || "IRGP",
				Remarks:         oHeader.Remarks || "",
				RevisedDueDate:  oHeader.RevisedDueDate || oHeader.DueDate,
				ReturnedDate:    oHeader.ReturnedDate || "",
				ReturnUser:      oHeader.ReturnUser || "",
				Status:          "Reservation Linked",
				MRNumber:        aItems.length === 1 ? aItems[0].MRNumber : aItems.map(function (it) { return it.MRNumber; }).join(","),
				Message:         "",
				IRGPItmNav:    aItems.map(function (it) {
					return {
						GatePassNo:       oHeader.IRGPNo,
						ItemNo:           it.ItemNo || String(it.SNo * 10).padStart(5, "0"),
						ItemCode:         it.ItemCode         || "",
						ItemDescription:  it.ItemDescription  || "",
						SentQuantity:     it.SentQuantity     || "0.000",
						RecievedQuantity: it.RecievedQuantity || "0.000",
						BalanceQuantity:  it.BalanceQuantity  || "0.000",
						UOM:              it.UOM              || "",
						MRNumber:         it.MRNumber         || "",
						Location:         it.Location         || "",
						Mp2ItmCode:       it.Mp2ItemCode       || "",
						DefaultBin:       it.DefaultBin        || ""
					};
				})
			};

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/IRGPHdrSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();

					this._updateCachedStatus(oHeader.IRGPNo, "PENDING_RECEIPT");

					var sMRNList = aItems.map(function (it) { return it.MRNumber; }).join(", ");
					var sMsg = "MRN Number(s) [" + sMRNList + "] linked successfully for IRGP " + oHeader.IRGPNo + ".";
					MessageBox.success(sMsg, {
						onClose: function () {
							oModel.setProperty("/ui/hasPendingChanges", false);
							this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
						}.bind(this)
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error(this._parseODataError(oError, "Failed to update reservation details."));
				}.bind(this)
			});
		},

		// =========================================================================
		// OData: Update — Verify Returns & Close (STORE_CLOSE step)
		// =========================================================================

		onSaveAmpCloseIRGPButtonPress: function () {
			this.onCloseIRGP();
		},

		onCloseIRGP: function () {
			var oModel  = this.getView().getModel("irgp");
			var oHeader = oModel.getProperty("/header");
			var aItems  = oModel.getProperty("/items");

			var bMissingRec = aItems.some(function (it) {
				return it.RecievedQuantity === undefined || parseFloat(it.RecievedQuantity) < 0;
			});
			if (bMissingRec) {
				MessageBox.error("Please verify received quantities for all rows.");
				return;
			}

			var bOutstanding = aItems.some(function (it) {
				return parseFloat(it.BalanceQuantity) > 0;
			});
			var sConfirm = bOutstanding
				? "There is still an outstanding balance on some items. Close this IRGP partially?"
				: "All materials accounted for. Confirm Gate Pass closure?";

			MessageBox.confirm(sConfirm, {
				onClose: function (oAction) {
					if (oAction !== MessageBox.Action.OK) { return; }

					var oODataModel = this.getOwnerComponent().getModel();
					if (!oODataModel) { return; }

					var sReturnedDate = new Date().toISOString().split("T")[0];
					var sODataStatus = STATUS_REVERSE[oHeader.StatusCode] || "Closed";
					var oPayload = {
						GatePassNo:   oHeader.IRGPNo,
						Status:       sODataStatus,
						ReturnedDate: sReturnedDate,
						ReturnUser:   oHeader.ReturnUser || "",
						IRGPItmNav:   aItems.map(function (it) {
							return {
								GatePassNo:       oHeader.IRGPNo,
								ItemNo:           it.ItemNo || String(it.SNo * 10).padStart(5, "0"),
								RecievedQuantity: parseFloat(it.RecievedQuantity || 0).toFixed(3),
								BalanceQuantity:  parseFloat(it.BalanceQuantity  || 0).toFixed(3)
							};
						})
					};

					sap.ui.core.BusyIndicator.show(0);
					oODataModel.create("/IRGPHdrSet", oPayload, {
						success: function (oData) {
							sap.ui.core.BusyIndicator.hide();
							var sMsg = oData.Message || "IRGP closed and archived successfully.";
							MessageBox.success(sMsg, {
								onClose: function () {
									oModel.setProperty("/ui/hasPendingChanges", false);
									this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
								}.bind(this)
							});
						}.bind(this),
						error: function (oError) {
							sap.ui.core.BusyIndicator.hide();
							MessageBox.error(this._parseODataError(oError, "Failed to close IRGP."));
						}.bind(this)
					});
				}.bind(this)
			});
		},

		// =========================================================================
		// Field Mapping: OData → local doc model
		// =========================================================================

		_sanitizeMRN: function (sVal) {
			if (!sVal) { return ""; }
			return /^0+$/.test(sVal.trim()) ? "" : sVal.trim();
		},

		// Normalise any SAP date format to "YYYY-MM-DD" for DatePicker valueFormat
		_formatSAPDate: function (vDate) {
			if (!vDate) { return ""; }
			// /Date(timestamp)/ or JavaScript Date object
			if (vDate instanceof Date) {
				if (isNaN(vDate.getTime())) { return ""; }
				return vDate.toISOString().slice(0, 10);
			}
			if (typeof vDate === "string") {
				// /Date(1748736000000)/
				var oTsMatch = vDate.match(/\/Date\((\d+)[^)]*\)\//);
				if (oTsMatch) {
					return new Date(parseInt(oTsMatch[1], 10)).toISOString().slice(0, 10);
				}
				// YYYYMMDD (all-zero = empty)
				if (/^\d{8}$/.test(vDate)) {
					if (/^0+$/.test(vDate)) { return ""; }
					return vDate.slice(0, 4) + "-" + vDate.slice(4, 6) + "-" + vDate.slice(6, 8);
				}
				// Already ISO — trim any time part
				if (/^\d{4}-\d{2}-\d{2}/.test(vDate)) {
					return vDate.slice(0, 10);
				}
			}
			return "";
		},

		_mapODataToDoc: function (oData) {
			var aRaw = (oData.IRGPItmNav && oData.IRGPItmNav.results) ? oData.IRGPItmNav.results : [];
			
			// Robust status mapping
			var sRawStatus = oData.Status || "";
			var sUpperStatus = sRawStatus.toUpperCase();
			var sMappedStatus = STATUS_MAP[sRawStatus] || oData.Status || "PENDING_RESERVATION";
			
			if (sUpperStatus.indexOf("RESERVATION LINKED") !== -1 || sUpperStatus.indexOf("PENDING RECEIPT") !== -1 || sUpperStatus.indexOf("RESERVATION_LINKED") !== -1) {
				sMappedStatus = "PENDING_RECEIPT";
			} else if (sUpperStatus.indexOf("CLOSED") !== -1) {
				sMappedStatus = "CLOSED";
			} else if (sUpperStatus.indexOf("OPEN") !== -1) {
				sMappedStatus = "PENDING_RESERVATION";
			}

			// If backend failed to update the status but saved the MR Number, 
			// dynamically derive the correct status.
			if (sMappedStatus === "PENDING_RESERVATION") {
				var bHasMRN = aRaw.some(function(it) {
					return it.MRNumber && it.MRNumber.trim() !== "";
				});
				// Also check header MRNumber just in case
				if (bHasMRN || (oData.MRNumber && oData.MRNumber.trim() !== "")) {
					sMappedStatus = "PENDING_RECEIPT";
				}
			}

			return {
				IRGPNo:               oData.GatePassNo     || "",
				GEDate:               this._formatSAPDate(oData.RequestDate),
				DueDate:              this._formatSAPDate(oData.DueDate),
				RevisedDueDate:       this._formatSAPDate(oData.RevisedDueDate),
				ReturnedDate:         this._formatSAPDate(oData.ReturnedDate),
				Department:           oData.Department     || "",
				RequestUser:          oData.RequestedUser  || "",
				ReturnUser:           oData.ReturnUser     || "",
				ContractName:         oData.ContractName   || "",
				ContractEmployeeName: oData.TAQAEmployee   || "",
				RequestType:          oData.RequestType    || "IRGP",
				Remarks:              oData.Remarks        || "",
				MRNumber:             this._sanitizeMRN(oData.MRNumber),
				StatusCode:           sMappedStatus,
				Message:              oData.Message        || "",
				items: aRaw.map(function (it, i) {
					// SAP item numbers are multiples of 10 ("00010","00020"…)
					var iSNo = it.ItemNo ? Math.round(parseInt(it.ItemNo, 10) / 10) : (i + 1);
					if (iSNo < 1) { iSNo = i + 1; }
					return {
						SNo:              iSNo,
						ItemNo:           it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						ItemCode:         it.ItemCode         || "",
						ItemDescription:  it.ItemDescription  || "",
						SentQuantity:     it.SentQuantity     || "0",
						RecievedQuantity: it.RecievedQuantity || "0",
						BalanceQuantity:  it.BalanceQuantity  || "0",
						UOM:              it.UOM              || "",
						MRNumber:         this._sanitizeMRN(it.MRNumber),
						Location:         it.Location         || "",
						Mp2ItemCode:      it.Mp2ItmCode        || "",
						DefaultBin:       it.DefaultBin       || ""
					};
				}.bind(this))
			};
		},

		// =========================================================================
		// Mode Application States
		// =========================================================================

		_applyListMode: function () {
			var oModel = this.getView().getModel("irgp");
			if (!oModel) {
				oModel = new JSONModel({});
				this.getView().setModel(oModel, "irgp");
			}
			oModel.setProperty("/ui/currentStep", "LIST");
			oModel.setProperty("/ui/title", "IRGP Workflow Dashboard");
		},

		_applyCreateMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep",   "CREATE");
			oModel.setProperty("/ui/title",         "Create Internal Returnable Gate Pass (IRGP)");
			oModel.setProperty("/ui/bannerText",     "Current Step: Materials Issue in Progress");
			oModel.setProperty("/ui/bannerType",     "Information");
			oModel.setProperty("/ui/headerEditable",  true);
			oModel.setProperty("/ui/itemsEditable",   true);
			oModel.setProperty("/ui/mrNumberEditable",false);
			oModel.setProperty("/ui/receivedQtyEditable", false);
			oModel.setProperty("/ui/submitVisible",   true);
			oModel.setProperty("/ui/submitResVisible",false);
			oModel.setProperty("/ui/closeVisible",    false);
			oModel.setProperty("/ui/printVisible",    false);
		},

		_applyUserUpdateMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep",   "USER_UPDATE");
			oModel.setProperty("/ui/title",         "Update Reservation Details");
			oModel.setProperty("/ui/bannerText",     "Current Step: Waiting for Department to Allocate & Link Reservation / MR Number");
			oModel.setProperty("/ui/bannerType",     "Warning");
			oModel.setProperty("/ui/headerEditable",  false);
			oModel.setProperty("/ui/itemsEditable",   false);
			oModel.setProperty("/ui/mrNumberEditable",true);
			oModel.setProperty("/ui/receivedQtyEditable", false);
			oModel.setProperty("/ui/submitVisible",   false);
			oModel.setProperty("/ui/submitResVisible",true);
			oModel.setProperty("/ui/closeVisible",    false);
			oModel.setProperty("/ui/printVisible",    true);
		},

		_applyStoreCloseMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep",        "STORE_CLOSE");
			oModel.setProperty("/ui/title",              "Add Quantities & Close IRGP");
			oModel.setProperty("/ui/bannerText",         "Store Step: Enter received quantities, select final status and save.");
			oModel.setProperty("/ui/bannerType",         "Warning");
			oModel.setProperty("/ui/headerEditable",      false);
			oModel.setProperty("/ui/itemsEditable",       false);
			oModel.setProperty("/ui/mrNumberEditable",    false);
			oModel.setProperty("/ui/receivedQtyEditable", true);
			oModel.setProperty("/ui/storeStatusEditable", true);
			oModel.setProperty("/ui/submitVisible",       false);
			oModel.setProperty("/ui/submitResVisible",    false);
			oModel.setProperty("/ui/closeVisible",        true);
			oModel.setProperty("/ui/printVisible",        true);

			// Auto-fill Returned Date and User for the Store Person
			if (!oModel.getProperty("/header/ReturnedDate")) {
				oModel.setProperty("/header/ReturnedDate", new Date().toISOString().split("T")[0]);
			}
			if (!oModel.getProperty("/header/ReturnUser")) {
				var oUserModel = sap.ui.getCore().getModel("user");
				var sUser = oUserModel ? (oUserModel.getProperty("/id") || oUserModel.getProperty("/User") || "Store User") : "Store User";
				oModel.setProperty("/header/ReturnUser", sUser);
			}
		},

		_applyClosedMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep",   "CLOSED");
			oModel.setProperty("/ui/title",         "IRGP Document Details (Archived)");
			oModel.setProperty("/ui/bannerText",     "Status: IRGP Closed Successfully — All Materials Accounted, Verified and Linked");
			oModel.setProperty("/ui/bannerType",     "Success");
			oModel.setProperty("/ui/headerEditable",  false);
			oModel.setProperty("/ui/itemsEditable",   false);
			oModel.setProperty("/ui/mrNumberEditable",false);
			oModel.setProperty("/ui/receivedQtyEditable", false);
			oModel.setProperty("/ui/submitVisible",   false);
			oModel.setProperty("/ui/submitResVisible",false);
			oModel.setProperty("/ui/closeVisible",    false);
			oModel.setProperty("/ui/printVisible",    true);
		},

		_applyModeForStep: function (sStep) {
			if      (sStep === "USER_UPDATE")  { this._applyUserUpdateMode(); }
			else if (sStep === "STORE_CLOSE")  { this._applyStoreCloseMode(); }
			else if (sStep === "CLOSED")       { this._applyClosedMode(); }
		},

		_buildUIFlags: function (sStep) {
			return {
				currentStep:          sStep,
				title:                "IRGP Details",
				hasPendingChanges:    false,
				bannerText:           "",
				bannerType:           "Information",
				headerEditable:       false,
				itemsEditable:        false,
				mrNumberEditable:     sStep === "USER_UPDATE",
				receivedQtyEditable:  sStep === "STORE_CLOSE",
				storeStatusEditable:  sStep === "STORE_CLOSE",
				revisedDueDateEditable: sStep === "STORE_CLOSE",
				submitVisible:        false,
				submitResVisible:     sStep === "USER_UPDATE",
				closeVisible:         sStep === "STORE_CLOSE",
				printVisible:         true
			};
		},

		// =========================================================================
		// List Actions (navigation)
		// =========================================================================

		onPressCreateNewIRGP: function () {
			this._getRouter().navTo("IRGP", { step: "CREATE", gpNo: "NEW" });
		},

		onFilterIRGPList: function (oEvent) {
			var sKey = oEvent.getParameter("key");
			var oTable = this.byId("idIRGPListTable");
			var oBinding = oTable.getBinding("items");
			var aFilters = [];
			if (sKey !== "ALL") {
				aFilters.push(new sap.ui.model.Filter("StatusCode", sap.ui.model.FilterOperator.EQ, sKey));
			}
			oBinding.filter(aFilters);
		},

		onActionLinkMRN: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("irgpGlobal").getObject();
			this._getRouter().navTo("IRGP", { step: "USER_UPDATE", gpNo: oItem.IRGPNo });
		},

		onAddQtyAmpCloseButtonPress: function (oEvent) {
			this.onActionVerifyReturn(oEvent);
		},

		onActionVerifyReturn: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("irgpGlobal").getObject();
			this._getRouter().navTo("IRGP", { step: "STORE_CLOSE", gpNo: oItem.IRGPNo });
		},

		onViewButtonPress: function (oEvent) {
			this.onActionViewClosed(oEvent);
		},

		onActionViewClosed: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("irgpGlobal").getObject();
			this._getRouter().navTo("IRGP", { step: "CLOSED", gpNo: oItem.IRGPNo });
		},

		// =========================================================================
		// Item Grid Calculations
		// =========================================================================

		onSentQtyChange: function (oEvent) {
			var oInput = oEvent.getSource();
			var sPath  = oInput.getBindingContext("irgp").getPath();
			var oModel = this.getView().getModel("irgp");
			var fSent  = parseFloat(oInput.getValue()) || 0;
			var fRec   = parseFloat(oModel.getProperty(sPath + "/RecievedQuantity")) || 0;
			oModel.setProperty(sPath + "/SentQuantity", String(fSent));
			this._recalculateBalance(sPath, fSent, fRec);
		},

		onRecievedQuantityInputLiveChange: function (oEvent) {
			this.onRecQtyChange(oEvent);
		},

		onRecQtyChange: function (oEvent) {
			var oInput = oEvent.getSource();
			var sPath  = oInput.getBindingContext("irgp").getPath();
			var oModel = this.getView().getModel("irgp");
			var fSent  = parseFloat(oModel.getProperty(sPath + "/SentQuantity")) || 0;
			var fRec   = parseFloat(oInput.getValue()) || 0;
			if (fRec > fSent) {
				MessageBox.error("Received Quantity cannot exceed Sent Quantity (" + fSent + ").");
				oInput.setValue("0");
				fRec = 0;
			}
			this._recalculateBalance(sPath, fSent, fRec);
		},

		_recalculateBalance: function (sPath, fSent, fRec) {
			var oModel = this.getView().getModel("irgp");
			var fBal = Math.max(fSent - fRec, 0);
			oModel.setProperty(sPath + "/BalanceQuantity", String(fBal));
			oModel.setProperty("/ui/hasPendingChanges", true);
		},

		onAddRowButtonPress: function () {
			this.onAddItem();
		},

		onAddItem: function () {
			var oModel = this.getView().getModel("irgp");
			var aItems = oModel.getProperty("/items") || [];
			aItems.push({
				SNo: aItems.length + 1,
				ItemCode: "", ItemDescription: "",
				SentQuantity: "0", RecievedQuantity: "0", BalanceQuantity: "0",
				UOM: "", MRNumber: "", Location: "", Mp2ItemCode: "", DefaultBin: ""
			});
			oModel.setProperty("/items", aItems);
			oModel.setProperty("/ui/hasPendingChanges", true);
			MessageToast.show("Row added.");
		},

		onDeleteItem: function (oEvent) {
			var oCtx   = oEvent.getSource().getBindingContext("irgp");
			var oModel = this.getView().getModel("irgp");
			var aItems = oModel.getProperty("/items");
			if (oCtx && aItems) {
				var iIdx = parseInt(oCtx.getPath().split("/").pop(), 10);
				aItems.splice(iIdx, 1);
				aItems.forEach(function (it, i) { it.SNo = i + 1; });
				oModel.setProperty("/items", aItems);
				oModel.setProperty("/ui/hasPendingChanges", true);
				MessageToast.show("Row removed.");
			}
		},

		// =========================================================================
		// Print & Reset
		// =========================================================================

		onPrint: function () {
			MessageBox.information("Triggering print preview for Gate Pass Slip...");
		},

		onReset: function () {
			MessageBox.confirm("Are you sure you want to reset the current form?", {
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this._resetFormModel();
					}
				}.bind(this)
			});
		},

		// =========================================================================
		// Navigation
		// =========================================================================

		onNavHome: function () {
			var oModel = this.getView().getModel("irgp");
			if (oModel && oModel.getProperty("/ui/hasPendingChanges")) {
				MessageBox.confirm("You have unsaved changes. Are you sure you want to leave?", {
					onClose: function (oAction) {
						if (oAction === MessageBox.Action.OK) {
							oModel.setProperty("/ui/hasPendingChanges", false);
							this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
						}
					}.bind(this)
				});
			} else {
				this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
			}
		},

		// =========================================================================
		// Helpers
		// =========================================================================

		_updateCachedStatus: function (sIRGPNo, sNewStatusCode) {
			var oGlobalModel = this.getOwnerComponent().getModel("irgpGlobal");
			if (!oGlobalModel) { return; }
			var aDocs = oGlobalModel.getProperty("/documents") || [];
			var oDoc = aDocs.find(function (d) { return d.IRGPNo === sIRGPNo; });
			if (oDoc) {
				oDoc.StatusCode = sNewStatusCode;
				oGlobalModel.setProperty("/documents", aDocs);
			}
		},

		_parseODataError: function (oError, sDefault) {
			try { return JSON.parse(oError.responseText).error.message.value; } catch (e) { return sDefault; }
		},

		_getRouter: function () {
			return sap.ui.core.UIComponent.getRouterFor(this);
		},

		getRouter: function () {
			return this._getRouter();
		},

		_resetFormModel: function () {
			var oData = {
				header: {
					IRGPNo: "Draft (Auto-Generated)",
					GEDate: new Date().toISOString().split("T")[0],
					DueDate: "",
					RevisedDueDate: "",
					ReturnedDate: "",
					Department: "",
					RequestUser: "",
					ReturnUser: "",
					ContractName: "",
					ContractEmployeeName: "",
					RequestType: "IRGP",
					Remarks: "",
					MRNumber: "",
					StatusCode: "CREATE"
				},
				items: [],
				dropdowns: this._getDefaultDropdowns(),
				ui: {
					currentStep: "CREATE",
					title: "Add IRGP",
					hasPendingChanges: false,
					bannerText: "",
					bannerType: "Information",
					headerEditable: true,
					itemsEditable: true,
					mrNumberEditable: false,
					receivedQtyEditable: false,
					storeStatusEditable: false,
					submitVisible: true,
					submitResVisible: false,
					closeVisible: false,
					printVisible: false
				}
			};
			var oModel = this.getView() ? this.getView().getModel("irgp") : null;
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView() && this.getView().setModel(new JSONModel(oData), "irgp");
			}
		},

		_getDefaultDropdowns: function () {
			return {
				departments: [
					{ key: "ELECTRICAL",      text: "ELECTRICAL" },
					{ key: "MECHANICAL",      text: "MECHANICAL" },
					{ key: "INSTRUMENTATION", text: "INSTRUMENTATION" },
					{ key: "STORES",          text: "STORES" }
				],
				uoms: [
					{ key: "Set", text: "Set" },
					{ key: "KG",  text: "Kilograms" },
					{ key: "EA",  text: "EA" },
					{ key: "NOS", text: "NOS" }
				]
			};
		}

	});
});
