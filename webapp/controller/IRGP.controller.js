sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (Controller, JSONModel, MessageBox, MessageToast, ExcelExport) {
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

					var oGlobalModel = this.getOwnerComponent().getModel("irgpGlobal");
					var aOldDocs = oGlobalModel ? (oGlobalModel.getProperty("/documents") || []) : [];

					// Map all records and filter out any corrupted ones with empty Gate Pass No
					var aAll = (oData.results || [])
						.map(this._mapODataToDoc.bind(this))
						.map(function (d) {
							// If backend commit is lagging and returns PENDING_RESERVATION, but we already
							// successfully linked the MRN locally (PENDING_RECEIPT), keep the local status
							var oOld = aOldDocs.find(function (old) { return old.IRGPNo === d.IRGPNo; });
							if (oOld && oOld.StatusCode === "PENDING_RECEIPT" && d.StatusCode === "PENDING_RESERVATION") {
								d.StatusCode = "PENDING_RECEIPT";
							}
							if (oOld && oOld.StatusCode === "CLOSED" && d.StatusCode !== "CLOSED") {
								d.StatusCode = "CLOSED";
							}
							return d;
						})
						.filter(function (d) { return d.IRGPNo && d.IRGPNo.trim() !== ""; });

					// User role sees only Pending Reservation items;
					// once MRN is linked the backend status changes and they fall off.
					var aDocs = bIsUserOnly
						? aAll.filter(function (d) { return d.StatusCode === "PENDING_RESERVATION"; })
						: aAll;

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
			
			if (oData.items) {
				oData.items.forEach(function (it) {
					var fSent = parseFloat(it.SentQuantity) || 0;
					var fRec = parseFloat(it.RecievedQuantity) || 0;
					var fBal = parseFloat(it.BalanceQuantity);
					if (isNaN(fBal)) {
						fBal = fSent;
					} else if (fBal === 0 && fRec === 0) {
						fBal = fSent;
					}

					it.PrevBalance = fBal;

					if (sStep === "STORE_CLOSE") {
						if (oData.RequestType === "Tools") {
							it.RecievedQuantity = String(fBal);
							it.BalanceQuantity = "0";
						} else {
							it.RecievedQuantity = "0";
							it.BalanceQuantity = String(fBal);
						}
					}
				});
			}

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
				RequestDate:     this._toSAPDate(oHeader.GEDate || new Date().toISOString().split("T")[0]),
				DueDate:         this._toSAPDate(oHeader.DueDate),
				Department:      oHeader.Department,
				RequestedUser:   oHeader.RequestUser  || "",
				ContractName:    oHeader.ContractName,
				TAQAEmployee:    oHeader.ContractEmployeeName,
				RequestType:     oHeader.RequestType  || "IRGP",
				Remarks:         oHeader.Remarks       || "",
				RevisedDueDate:  this._toSAPDate(oHeader.RevisedDueDate || oHeader.DueDate),
				ReturnedDate:    "",
				ReturnUser:      "",
				MRNumber:        "",
				Status:          oHeader.RequestType === "Tools" ? "Reservation Linked" : "Open",
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
					var oPrintHeader = {
						IRGPNo:               sGPNo,
						GEDate:               oHeader.GEDate,
						DueDate:              oHeader.DueDate,
						Department:           oHeader.Department,
						RequestType:          oHeader.RequestType || "IRGP",
						RequestUser:          oHeader.RequestUser || "",
						ContractName:         oHeader.ContractName,
						ContractEmployeeName: oHeader.ContractEmployeeName,
						Remarks:              oHeader.Remarks || ""
					};
					MessageBox.show("IRGP " + sGPNo + " created successfully.", {
						icon: MessageBox.Icon.SUCCESS,
						title: "IRGP Created",
						actions: ["Print", "Go to List"],
						emphasizedAction: "Print",
						onClose: function (sAction) {
							oModel.setProperty("/ui/hasPendingChanges", false);
							if (sAction === "Print") {
								this._printDocument(oPrintHeader, aItems).then(function () {
									this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
								}.bind(this));
							} else {
								this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
							}
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
				RequestDate:     this._toSAPDate(oHeader.GEDate || new Date().toISOString().split("T")[0]),
				DueDate:         this._toSAPDate(oHeader.DueDate),
				Department:      oHeader.Department,
				RequestedUser:   oHeader.RequestUser || "",
				ContractName:    oHeader.ContractName,
				TAQAEmployee:    oHeader.ContractEmployeeName,
				RequestType:     oHeader.RequestType || "IRGP",
				Remarks:         oHeader.Remarks || "",
				RevisedDueDate:  this._toSAPDate(oHeader.RevisedDueDate || oHeader.DueDate),
				ReturnedDate:    this._toSAPDate(oHeader.ReturnedDate || ""),
				ReturnUser:      oHeader.ReturnUser || "",
				Status:          "Reservation Linked",
				MRNumber:        aItems[0] ? aItems[0].MRNumber : "",
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
							sap.ui.core.BusyIndicator.show(0);
							// Wait 1.5 seconds for SAP ABAP BAPI_TRANSACTION_COMMIT to finish in background
							setTimeout(function() {
								sap.ui.core.BusyIndicator.hide();
								this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
							}.bind(this), 1500);
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
		// OData: Update — Edit existing IRGP (EDIT step)
		// =========================================================================

		onSubmitEdit: function () {
			var oModel  = this.getView().getModel("irgp");
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
				GatePassNo:      oHeader.IRGPNo,
				RequestDate:     this._toSAPDate(oHeader.GEDate || new Date().toISOString().split("T")[0]),
				DueDate:         this._toSAPDate(oHeader.DueDate),
				Department:      oHeader.Department,
				RequestedUser:   oHeader.RequestUser  || "",
				ContractName:    oHeader.ContractName,
				TAQAEmployee:    oHeader.ContractEmployeeName,
				RequestType:     oHeader.RequestType  || "IRGP",
				Remarks:         oHeader.Remarks      || "",
				RevisedDueDate:  this._toSAPDate(oHeader.RevisedDueDate || oHeader.DueDate),
				ReturnedDate:    this._toSAPDate(oHeader.ReturnedDate   || ""),
				ReturnUser:      oHeader.ReturnUser   || "",
				MRNumber:        oHeader.MRNumber     || "",
				Status:          STATUS_REVERSE[oHeader.StatusCode] || "Open",
				Message:         "",
				IRGPItmNav: aItems.map(function (it, i) {
					return {
						GatePassNo:       oHeader.IRGPNo,
						ItemNo:           it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						ItemCode:         it.ItemCode        || "",
						ItemDescription:  it.ItemDescription || "",
						SentQuantity:     parseFloat(it.SentQuantity     || 0).toFixed(3),
						RecievedQuantity: parseFloat(it.RecievedQuantity || 0).toFixed(3),
						BalanceQuantity:  parseFloat(it.BalanceQuantity  || it.SentQuantity || 0).toFixed(3),
						UOM:              it.UOM             || "",
						MRNumber:         it.MRNumber        || "",
						Location:         it.Location        || "",
						Mp2ItmCode:       it.Mp2ItemCode      || "",
						DefaultBin:       it.DefaultBin       || ""
					};
				})
			};

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/IRGPHdrSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = (oData && oData.Message) || ("IRGP " + oHeader.IRGPNo + " updated successfully.");
					var oPrintHeader = {
						IRGPNo:               oHeader.IRGPNo,
						GEDate:               oHeader.GEDate,
						DueDate:              oHeader.DueDate,
						Department:           oHeader.Department,
						RequestType:          oHeader.RequestType || "IRGP",
						RequestUser:          oHeader.RequestUser || "",
						ContractName:         oHeader.ContractName,
						ContractEmployeeName: oHeader.ContractEmployeeName,
						Remarks:              oHeader.Remarks || ""
					};
					MessageBox.show(sMsg, {
						icon: MessageBox.Icon.SUCCESS,
						title: "IRGP Updated",
						actions: ["Print", "Go to List"],
						emphasizedAction: "Print",
						onClose: function (sAction) {
							oModel.setProperty("/ui/hasPendingChanges", false);
							if (sAction === "Print") {
								this._printDocument(oPrintHeader, aItems).then(function () {
									this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
								}.bind(this));
							} else {
								this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
							}
						}.bind(this)
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error(this._parseODataError(oError, "Failed to update IRGP."));
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
						GatePassNo:      oHeader.IRGPNo,
						RequestDate:     this._toSAPDate(oHeader.GEDate || new Date().toISOString().split("T")[0]),
						DueDate:         this._toSAPDate(oHeader.DueDate),
						Department:      oHeader.Department,
						RequestedUser:   oHeader.RequestUser || "",
						ContractName:    oHeader.ContractName,
						TAQAEmployee:    oHeader.ContractEmployeeName,
						RequestType:     oHeader.RequestType || "IRGP",
						Remarks:         oHeader.Remarks || "",
						RevisedDueDate:  this._toSAPDate(oHeader.RevisedDueDate || oHeader.DueDate),
						ReturnedDate:    this._toSAPDate(sReturnedDate),
						ReturnUser:      oHeader.ReturnUser || "",
						Status:          sODataStatus,
						MRNumber:        oHeader.MRNumber || (aItems[0] ? aItems[0].MRNumber : ""),
						Message:         "",
						IRGPItmNav:    aItems.map(function (it) {
							return {
								GatePassNo:       oHeader.IRGPNo,
								ItemNo:           it.ItemNo || String(it.SNo * 10).padStart(5, "0"),
								ItemCode:         it.ItemCode         || "",
								ItemDescription:  it.ItemDescription  || "",
								SentQuantity:     parseFloat(it.SentQuantity || 0).toFixed(3),
								RecievedQuantity: parseFloat(it.RecievedQuantity || 0).toFixed(3),
								BalanceQuantity:  parseFloat(it.BalanceQuantity  || 0).toFixed(3),
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
			var sTrim = sVal.trim();
			if (/^0+$/.test(sTrim)) { return ""; }
			return sTrim.replace(/^0+/, "");
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

		// Format "YYYY-MM-DD" to "YYYYMMDD" for backend SAP payloads
		_toSAPDate: function (sDate) {
			if (!sDate) { return ""; }
			return sDate.replace(/-/g, "");
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
				var that = this;
				var bHasMRN = aRaw.some(function(it) {
					return that._sanitizeMRN(it.MRNumber) !== "";
				});
				// Also check header MRNumber just in case
				if (bHasMRN || this._sanitizeMRN(oData.MRNumber) !== "") {
					sMappedStatus = "PENDING_RECEIPT";
				}
				if (oData.RequestType === "Tools") {
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
			oModel.setProperty("/ui/mrNumberEditable",false);
			oModel.setProperty("/ui/receivedQtyEditable", false);
			oModel.setProperty("/ui/submitVisible",   false);
			oModel.setProperty("/ui/submitResVisible",true);
			oModel.setProperty("/ui/closeVisible",    false);
			oModel.setProperty("/ui/printVisible",    false);
		},

		_applyStoreCloseMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep",        "STORE_CLOSE");
			oModel.setProperty("/ui/title",              "Add Quantities & Close IRGP");
			oModel.setProperty("/ui/bannerText",         "Store Step: Enter received quantities, select final status and save.");
			oModel.setProperty("/ui/bannerType",         "Warning");
			oModel.setProperty("/ui/headerEditable",      false);
			oModel.setProperty("/ui/itemsEditable",       false);
			oModel.setProperty("/ui/mrNumberEditable",    true);
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

		_applyEditMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep",          "EDIT");
			oModel.setProperty("/ui/title",                "Edit IRGP");
			oModel.setProperty("/ui/bannerText",           "Edit Mode: Modify IRGP details and resubmit.");
			oModel.setProperty("/ui/bannerType",           "Warning");
			oModel.setProperty("/ui/headerEditable",        true);
			oModel.setProperty("/ui/itemsEditable",         true);
			oModel.setProperty("/ui/mrNumberEditable",      false);
			oModel.setProperty("/ui/receivedQtyEditable",   false);
			oModel.setProperty("/ui/submitVisible",         false);
			oModel.setProperty("/ui/submitResVisible",      false);
			oModel.setProperty("/ui/closeVisible",          false);
			oModel.setProperty("/ui/printVisible",          false);
			oModel.setProperty("/ui/submitEditVisible",     true);
		},

		_applyModeForStep: function (sStep) {
			if      (sStep === "USER_UPDATE")  { this._applyUserUpdateMode(); }
			else if (sStep === "STORE_CLOSE")  { this._applyStoreCloseMode(); }
			else if (sStep === "CLOSED")       { this._applyClosedMode(); }
			else if (sStep === "EDIT")         { this._applyEditMode(); }
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
				mrNumberEditable:     sStep === "STORE_CLOSE",
				receivedQtyEditable:  sStep === "STORE_CLOSE",
				storeStatusEditable:  sStep === "STORE_CLOSE",
				revisedDueDateEditable: sStep === "STORE_CLOSE",
				submitVisible:        false,
				submitResVisible:     sStep === "USER_UPDATE",
				submitEditVisible:    sStep === "EDIT",
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

		onDownloadExcel: function () {
			var aObjects = this.getOwnerComponent().getModel("irgpGlobal").getProperty("/documents") || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GEDate", dFrom, dTo);
			if (!aObjects.length) {
				MessageToast.show("No data to export.");
				return;
			}

			var STATUS_LABELS = {
				"PENDING_RESERVATION": "Pending Reservation",
				"PENDING_RECEIPT": "Completed Reservation",
				"CLOSED": "Closed & Archived"
			};

			var aRows = [];
			aObjects.forEach(function (o) {
				var oHeader = {
					"Gate Pass No": o.IRGPNo || "",
					"Request Date": o.GEDate || "",
					"Department": o.Department || "",
					"Requested User": o.RequestUser || "",
					"Contract Employee": o.ContractEmployeeName || "",
					"Status": STATUS_LABELS[o.StatusCode] || o.StatusCode || "",
					"Due Date": o.DueDate || "",
					"Revised Due Date": o.RevisedDueDate || "",
					"Returned Date": o.ReturnedDate || "",
					"Return User": o.ReturnUser || "",
					"Contract Name": o.ContractName || "",
					"Request Type": o.RequestType || "",
					"Remarks": o.Remarks || "",
					"MR Number": o.MRNumber || ""
				};
				var aItems = o.items || [];
				if (aItems.length === 0) {
					oHeader["Item SNo"] = "";
					oHeader["Item No"] = "";
					oHeader["Item Code"] = "";
					oHeader["Item Description"] = "";
					oHeader["Sent Quantity"] = "";
					oHeader["Received Quantity"] = "";
					oHeader["Balance Quantity"] = "";
					oHeader["Item UOM"] = "";
					oHeader["Item MR Number"] = "";
					oHeader["Item Location"] = "";
					oHeader["Mp2 Item Code"] = "";
					oHeader["Default Bin"] = "";
					aRows.push(oHeader);
				} else {
					aItems.forEach(function (item) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item SNo"] = item.SNo || "";
						oRow["Item No"] = item.ItemNo || "";
						oRow["Item Code"] = item.ItemCode || "";
						oRow["Item Description"] = item.ItemDescription || "";
						oRow["Sent Quantity"] = item.SentQuantity || "";
						oRow["Received Quantity"] = item.RecievedQuantity || "";
						oRow["Balance Quantity"] = item.BalanceQuantity || "";
						oRow["Item UOM"] = item.UOM || "";
						oRow["Item MR Number"] = item.MRNumber || "";
						oRow["Item Location"] = item.Location || "";
						oRow["Mp2 Item Code"] = item.Mp2ItemCode || "";
						oRow["Default Bin"] = item.DefaultBin || "";
						aRows.push(oRow);
					});
				}
			});

			var sTabKey = this.byId("idIRGPIconTabBar").getSelectedKey();
			var aParts = ["IRGP"];
			if (sTabKey && sTabKey !== "ALL") { aParts.push(sTabKey.replace(/\s+/g, "_")); }
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			var sFileName = aParts.join("_") + ".xlsx";
			var sSheetName = aParts.join(" ");
			ExcelExport.download(aRows, sSheetName, sFileName, 14);
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

		onActionEdit: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("irgpGlobal").getObject();
			this._getRouter().navTo("IRGP", { step: "EDIT", gpNo: oItem.IRGPNo });
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
			var fPrevBal = parseFloat(oModel.getProperty(sPath + "/PrevBalance"));
			if (isNaN(fPrevBal)) {
				fPrevBal = parseFloat(oModel.getProperty(sPath + "/SentQuantity")) || 0;
			}
			var fRec   = parseFloat(oInput.getValue()) || 0;
			if (fRec > fPrevBal) {
				MessageBox.error("Received Quantity cannot exceed remaining Balance Quantity (" + fPrevBal + ").");
				oInput.setValue("0");
				fRec = 0;
			}
			this._recalculateBalance(sPath, fPrevBal, fRec);
		},

		_recalculateBalance: function (sPath, fBase, fRec) {
			var oModel = this.getView().getModel("irgp");
			var fBal = Math.max(fBase - fRec, 0);
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

		// ==========================================================
		onPrint: async function () {
			var oIRGP = this.getView().getModel("irgp").getData();
			if (!oIRGP.header.IRGPNo || oIRGP.header.IRGPNo === "Draft (Auto-Generated)") {
				MessageBox.warning("Please submit/save the IRGP first before printing.");
				return;
			}
			this._printDocument(oIRGP.header, oIRGP.items);
		},

		onPrintRow: async function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("irgpGlobal").getObject();
			var oHeader = {
				IRGPNo:               oItem.IRGPNo,
				GEDate:               oItem.GEDate,
				DueDate:              oItem.DueDate,
				Department:           oItem.Department,
				RequestType:          oItem.RequestType,
				RequestUser:          oItem.RequestUser,
				ContractName:         oItem.ContractName,
				ContractEmployeeName: oItem.ContractEmployeeName,
				Remarks:              oItem.Remarks
			};
			this._printDocument(oHeader, oItem.items);
		},

		_printDocument: async function (oHeader, aItems) {
			const { jsPDF } = window.jspdf;
			// ── Landscape A4 ─────────────────────────────────────────────────────
			var doc = new jsPDF('l', 'mm', 'a4');
			var pageWidth  = doc.internal.pageSize.width;   // 297mm
			var pageHeight = doc.internal.pageSize.height;  // 210mm
			var margin = 14;
			var cW = pageWidth - margin * 2;                // content width ~269mm

			// ── Logo ─────────────────────────────────────────────────────────────
			var sLogoUrl    = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			var sLogoBase64 = null;
			try { sLogoBase64 = await this._getImageBase64(sLogoUrl); } catch (e) { /* optional */ }

			// ── Helper: format date DD-MM-YYYY ───────────────────────────────────
			var fmtDate = function (s) {
				if (!s) { return ""; }
				if (/^\d{2}-\d{2}-\d{4}$/.test(s)) { return s; }   // already formatted
				var d = new Date(s);
				if (isNaN(d)) { return s; }
				var dd = String(d.getDate()).padStart(2, "0");
				var mm = String(d.getMonth() + 1).padStart(2, "0");
				var yy = d.getFullYear();
				return dd + "-" + mm + "-" + yy;
			};

			// ── Build items rows (pad to at least 5) ─────────────────────────────
			var tableData = (aItems || []).map(function (it, i) {
				return [
					i + 1,
					it.ItemCode        || "",
					it.Location        || "",
					it.Mp2ItemCode     || "",
					it.ItemDescription || "",
					parseFloat(it.SentQuantity || 0).toFixed(2),
					it.UOM             || "",
					it.DefaultBin      || ""
				];
			});
			while (tableData.length < 5) { tableData.push(["", "", "", "", "", "", "", ""]); }

			// ═══════════════════════════════════════════════════════════════════
			// didDrawPage  –  header drawn on every page
			// ═══════════════════════════════════════════════════════════════════
			var drawHeader = function () {
				var y = margin;

				// Logo (top-left)
				if (sLogoBase64) {
					doc.addImage(sLogoBase64, 'PNG', margin, y, 28, 11);
				} else {
					doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(180, 0, 0);
					doc.text("MEIL", margin, y + 8);
					doc.setTextColor(0, 0, 0);
				}

				// Company name – centred, large bold
				doc.setFont("helvetica", "bold");
				doc.setFontSize(16);
				doc.setTextColor(0, 0, 0);
				doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, y + 8, { align: "center" });

				// Subtitle – underlined, centred
				y += 14;
				doc.setFont("helvetica", "normal");
				doc.setFontSize(9.5);
				var sSubtitle = "Internal Returnable Gate Pass (IRGP)";
				var subW = doc.getTextWidth(sSubtitle);
				var subX = (pageWidth - subW) / 2;
				doc.text(sSubtitle, subX, y);
				doc.setLineWidth(0.3);
				doc.line(subX, y + 0.8, subX + subW, y + 0.8);  // underline

				// ── Info row: left (IRGP No + tagline) / right (Req Dept / GP Date / Due Date) ──
				y += 7;
				var rightLabelX = pageWidth - margin - 56;
				var rightValueX = pageWidth - margin - 2;

				// IRGP No – bold
				doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
				doc.text("IRGP No: " + (oHeader.IRGPNo || ""), margin, y);
				// Tagline below
				doc.setFont("helvetica", "normal"); doc.setFontSize(8);
				doc.text("To take out the following material", margin, y + 5);

				// Right: Req Dept
				doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
				doc.text("Req Dept:", rightLabelX, y);
				doc.setFont("helvetica", "normal");
				doc.text(oHeader.Department || "", rightValueX, y, { align: "right" });

				// GP Date
				doc.setFont("helvetica", "bold");
				doc.text("GP Date:", rightLabelX, y + 5);
				doc.setFont("helvetica", "normal");
				doc.text(fmtDate(oHeader.GEDate), rightValueX, y + 5, { align: "right" });

				// Due Date
				doc.setFont("helvetica", "bold");
				doc.text("Due Date:", rightLabelX, y + 10);
				doc.setFont("helvetica", "normal");
				doc.text(fmtDate(oHeader.DueDate), rightValueX, y + 10, { align: "right" });
			};

			// ── Table starting Y ─────────────────────────────────────────────────
			var tableStartY = margin + 14 + 7 + 15;  // header block height ≈ 51mm

			// ── Draw the items table ─────────────────────────────────────────────
			doc.autoTable({
				startY: tableStartY,
				head: [['S.No', 'Item Code', 'Location', 'Mp2ItemCode', 'DESCRIPTION', 'QTY', 'UOM', 'DefaultBin']],
				body: tableData,
				theme: 'grid',
				headStyles: {
					fillColor: [255, 255, 255],
					textColor: [0, 0, 0],
					fontStyle: 'bold',
					fontSize: 8,
					halign: 'left',
					valign: 'middle',
					cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
					lineWidth: 0.3,
					lineColor: [0, 0, 0]
				},
				bodyStyles: {
					fontSize: 8,
					cellPadding: { top: 3.5, bottom: 3.5, left: 2, right: 2 },
					lineColor: [0, 0, 0],
					lineWidth: 0.25,
					valign: 'middle',
					fillColor: [255, 255, 255],
					textColor: [0, 0, 0]
				},
				alternateRowStyles: { fillColor: [255, 255, 255] },
				columnStyles: {
					0: { cellWidth: 12,    halign: 'center' },
					1: { cellWidth: 34,    halign: 'left'   },
					2: { cellWidth: 22,    halign: 'left'   },
					3: { cellWidth: 28,    halign: 'left'   },
					4: { cellWidth: 'auto', halign: 'left' },
					5: { cellWidth: 16,    halign: 'center' },
					6: { cellWidth: 18,    halign: 'left'   },
					7: { cellWidth: 30,    halign: 'left'   }
				},
				margin: { left: margin, right: margin },
				didDrawPage: function () { drawHeader(); }
			});

			// ── Remarks row (full width, below table) ────────────────────────────
			var finalY = doc.lastAutoTable.finalY;
			var remH   = 8;
			doc.setLineWidth(0.3);
			doc.rect(margin, finalY, cW, remH);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Remarks", margin + 2, finalY + 5.5);
			doc.setLineWidth(0.25);
			doc.line(margin + 20, finalY, margin + 20, finalY + remH);  // separator after "Remarks"
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			var sRem = doc.splitTextToSize(oHeader.Remarks || "", cW - 26);
			doc.text(sRem, margin + 23, finalY + 5.5);

			// ── Footer info block ────────────────────────────────────────────────
			var footY = finalY + remH + 10;
			var halfW = cW / 2;

			// Left: Prepared Name
			doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
			doc.text("Prepared Name:", margin, footY);
			doc.setFont("helvetica", "normal");
			doc.text(oHeader.RequestUser || "", margin + 32, footY);

			// Right: Req Name
			doc.setFont("helvetica", "bold");
			doc.text("Req Name:", margin + halfW, footY);
			doc.setFont("helvetica", "normal");
			doc.text(oHeader.RequestUser || "", margin + halfW + 22, footY);

			// Left: Contract Name
			doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
			doc.text("Contract Name:", margin, footY + 8);
			doc.setFont("helvetica", "normal");
			var sContract = doc.splitTextToSize(oHeader.ContractName || "", halfW - 34);
			doc.text(sContract, margin + 32, footY + 8);

			// Right: Contract/Employee Name
			doc.setFont("helvetica", "bold");
			doc.text("Contract/Employee Name:", margin + halfW, footY + 8);
			doc.setFont("helvetica", "normal");
			var sEmpName = doc.splitTextToSize(oHeader.ContractEmployeeName || "", halfW - 46);
			doc.text(sEmpName, margin + halfW + 46, footY + 8);

			// ── Signature area ───────────────────────────────────────────────────
			var sigY = pageHeight - 22;

			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("For MEIL Neyveli Energy Private Limited", margin, sigY);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Authorised Signatory", margin, sigY + 14);

			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Receiver's Sign", pageWidth - margin, sigY + 14, { align: "right" });

			// ── Draw header once (first page already rendered by autoTable callback) ─
			// (autoTable calls didDrawPage for each page, so header is already drawn)

			// ── Open print dialog ────────────────────────────────────────────────
			doc.autoPrint();
			window.open(doc.output('bloburl'), '_blank');
			sap.m.MessageToast.show("Print Preview Opened");
		},

		_getImageBase64: function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image();
				img.crossOrigin = "Anonymous";
				img.onload = function () {
					var canvas = document.createElement('canvas');
					canvas.width = img.width;
					canvas.height = img.height;
					var ctx = canvas.getContext('2d');
					ctx.drawImage(img, 0, 0);
					resolve(canvas.toDataURL('image/png'));
				};
				img.onerror = function (err) {
					reject(err);
				};
				img.src = url;
			});
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
					submitEditVisible: false,
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
					{ key: "Amps", text: "Amps" },
					{ key: "Bag", text: "Bag" },
					{ key: "Barrel", text: "Barrel" },
					{ key: "Bottle", text: "Bottle" },
					{ key: "Box", text: "Box" },
					{ key: "Bundle", text: "Bundle" },
					{ key: "Can", text: "Can" },
					{ key: "Carton", text: "Carton" },
					{ key: "Cartridge", text: "Cartridge" },
					{ key: "Coil", text: "Coil" },
					{ key: "Cubic Feet", text: "Cubic Feet" },
					{ key: "Cubic Meter", text: "Cubic Meter" },
					{ key: "Cylinder", text: "Cylinder" },
					{ key: "Drum", text: "Drum" },
					{ key: "Feet", text: "Feet" },
					{ key: "Kilogram", text: "Kilogram" },
					{ key: "Length", text: "Length" },
					{ key: "Litre", text: "Litre" },
					{ key: "Load", text: "Load" },
					{ key: "Lot", text: "Lot" },
					{ key: "Meters", text: "Meters" },
					{ key: "Metric Tons", text: "Metric Tons" },
					{ key: "Month", text: "Month" },
					{ key: "Number", text: "Number" },
					{ key: "Pair", text: "Pair" },
					{ key: "Roll", text: "Roll" },
					{ key: "Set", text: "Set" },
					{ key: "Sheet", text: "Sheet" },
					{ key: "Square Feet", text: "Square Feet" },
					{ key: "Square Meter", text: "Square Meter" },
					{ key: "Item", text: "Item" },
					{ key: "Pack", text: "Pack" },
					{ key: "Days", text: "Days" },
					{ key: "Pocket", text: "Pocket" },
					{ key: "Ream", text: "Ream" },
					{ key: "Tons", text: "Tons" },
					{ key: "Unit", text: "Unit" }
				]
			};
		}

	});
});
