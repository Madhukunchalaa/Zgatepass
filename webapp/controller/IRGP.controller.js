sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"zgpms/meilpower/com/utils/ExcelExport",
	"sap/ui/core/Fragment"
], function (BaseController, JSONModel, MessageBox, MessageToast, ExcelExport, Fragment) {
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

	return BaseController.extend("zgpms.meilpower.com.controller.IRGP", {

		// =========================================================================
		// Lifecycle
		// =========================================================================

		onInit: function () {
			this.getView().setModel(new JSONModel({}), "sortModel");
			this._getRouter().getRoute("IRGP").attachPatternMatched(this._onRouteMatched, this);
			this._resetFormModel();
		},

		_onRouteMatched: function (oEvent) {
			var oArgs = oEvent.getParameter("arguments");
			var sStep = oArgs.step ? oArgs.step.toUpperCase() : "CREATE";
			var sGPNo = oArgs.gpNo || "";

			this._loadMaterials();

			if (sStep === "LIST") {
				this._applyListMode();
				this._loadList();
			} else {
				this._loadVendors();
				this._loadDepartments();
				if (sStep === "CREATE") {
					this._resetFormModel();
					this._applyCreateMode();
				} else {
					this._loadDocument(sStep, sGPNo);
				}
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
							// If backend commit is lagging, keep a locally closed status.
							// (Linked-MRN lag is already handled in _mapODataToDoc from the line MRNs;
							// forcing PENDING_RECEIPT here hid resent balances from the User.)
							var oOld = aOldDocs.find(function (old) { return old.IRGPNo === d.IRGPNo; });
							if (oOld && oOld.StatusCode === "CLOSED" && d.StatusCode !== "CLOSED") {
								d.StatusCode = "CLOSED";
								d.StatusDisplay = "CLOSED";
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

		_resolveFullReturnUser: function (sRetUser, sReqUser) {
			sRetUser = (sRetUser || "").trim();
			sReqUser = (sReqUser || "").trim();
			if (!sRetUser) {
				return sReqUser;
			}
			if (sReqUser) {
				var sReqId = (sReqUser.split(" - ")[0] || "").trim();
				var sRetId = (sRetUser.split(" - ")[0] || "").trim();
				// If ReturnUser is a truncated prefix of RequestUser (e.g. "5006 - Muthu" vs "5006 - Muthuraman Arunachalam")
				// or both share the same employee ID prefix
				if (sReqUser.indexOf(sRetUser) === 0 || (sReqId && sRetId && sReqId === sRetId)) {
					return sReqUser;
				}
			}
			var oModel = this.getView() && this.getView().getModel("irgp");
			var aUsers = oModel ? (oModel.getProperty("/dropdowns/users") || []) : [];
			var sCheckId = (sRetUser.split(" - ")[0] || "").trim();
			if (sCheckId && aUsers.length > 0) {
				var oMatched = aUsers.find(function (u) {
					return u.key === sCheckId || (u.text && u.text.indexOf(sRetUser) === 0);
				});
				if (oMatched && oMatched.text) {
					return oMatched.text;
				}
			}
			return sRetUser;
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

					// Lines already fully received in an earlier round keep their quantities
					if (sStep === "STORE_CLOSE" && fBal > 0) {
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

			var sReqUser = oData.RequestUser || (oData.header && oData.header.RequestUser) || "";
			var sRetUser = this._resolveFullReturnUser(oData.ReturnUser || (oData.header && oData.header.ReturnUser), sReqUser);
			var sRetDate = this._displayDateToISO(oData.ReturnedDate || (oData.header && oData.header.ReturnedDate)) || new Date().toISOString().split("T")[0];
			var sDueDate = this._displayDateToISO(oData.DueDate || (oData.header && oData.header.DueDate));
			var sRevDate = this._displayDateToISO(oData.RevisedDueDate || (oData.header && oData.header.RevisedDueDate)) || sDueDate;

			oData.dropdowns = this._getDefaultDropdowns();
			oData.ui = this._buildUIFlags(sStep);
			// wrap header fields so the form binding path (/header/...) works
			if (!oData.header) {
				oData.header = {
					IRGPNo:               oData.IRGPNo               || "",
					// List docs hold dates as DD-MM-YYYY; DatePickers and payloads need YYYY-MM-DD
					GEDate:               this._displayDateToISO(oData.GEDate),
					DueDate:              sDueDate,
					RevisedDueDate:       sRevDate,
					ReturnedDate:         sRetDate,
					Department:           oData.Department           || "",
					RequestUser:          sReqUser,
					// Material is returned by the requested user
					ReturnUser:           sRetUser,
					ContractName:         oData.ContractName         || "",
					ContractEmployeeName: oData.ContractEmployeeName || "",
					RequestType:          oData.RequestType          || "IRGP",
					Remarks:              oData.Remarks              || "",
					MRNumber:             oData.MRNumber             || "",
					StatusCode:           oData.StatusCode           || "",
					Message:              oData.Message              || ""
				};
			} else {
				oData.header.ReturnUser = sRetUser;
				oData.header.RequestUser = sReqUser;
				oData.header.ReturnedDate = sRetDate;
				oData.header.RevisedDueDate = sRevDate;
			}
			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "irgp");

			// Load users for the department if present so ComboBox displays properly
			var sDept = oData.header.Department || oData.Department || "";
			if (sDept) {
				this._loadUsersForDepartment(sDept);
			}

			this._applyModeForStep(sStep);
		},

		// =========================================================================
		// OData: Create (Submit new IRGP)
		// =========================================================================

		onSubmit: async function () {
			var that = this;
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

			sap.ui.core.BusyIndicator.show(0);

			var sBase64 = "";
			try {
				var oPrintHeader = {
					IRGPNo:               "", // GP number not yet generated
					GEDate:               oHeader.GEDate || new Date().toISOString().split("T")[0],
					DueDate:              oHeader.DueDate,
					Department:           oHeader.Department,
					RequestType:          oHeader.RequestType || "IRGP",
					RequestUser:          oHeader.RequestUser || "",
					ContractName:         oHeader.ContractName,
					ContractEmployeeName: oHeader.ContractEmployeeName,
					Remarks:              oHeader.Remarks || ""
				};
				sBase64 = await this._printDocument(oPrintHeader, aItems, true);
			} catch (e) {
				console.error("Error generating IRGP PDF Base64 string:", e);
			}

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
				IRGPBase64:      sBase64,
				IRGPItmNav: aItems.map(function (it, i) {
					var bIsTool = (oHeader.RequestType === "Tools");
					var sToolDesc = bIsTool ? (it.ItemDescription || it.ItemCode || "") : "";
					return {
						GatePassNo:        "",
						ItemNo:            String((i + 1) * 10).padStart(5, "0"),
						ItemCode:          bIsTool ? sToolDesc : (it.ItemCode || ""),
						ItemDescription:   bIsTool ? sToolDesc : (it.ItemDescription || ""),
						SentQuantity:      parseFloat(it.SentQuantity || 0).toFixed(3),
						RecievedQuantity:  "0.000",
						BalanceQuantity:   parseFloat(it.SentQuantity || 0).toFixed(3),
						UOM:               that._toSAPUOM(it.UOM),
						MRNumber:          "",
						Location:          it.Location        || "",
						OldMaterialRef:    it.OldMaterialRef  || "",
						Mp2ItmCode:        it.Mp2ItemCode      || "",
						DefaultBin:        it.DefaultBin       || ""
					};
				})
			};

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

			var that = this;
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
					var bIsTool = (oHeader.RequestType === "Tools");
					var sToolDesc = bIsTool ? (it.ItemDescription || it.ItemCode || "") : "";
					return {
						GatePassNo:       oHeader.IRGPNo,
						ItemNo:           it.ItemNo || String(it.SNo * 10).padStart(5, "0"),
						ItemCode:         bIsTool ? sToolDesc : (it.ItemCode || ""),
						ItemDescription:  bIsTool ? sToolDesc : (it.ItemDescription || ""),
						SentQuantity:     it.SentQuantity     || "0.000",
						RecievedQuantity: it.RecievedQuantity || "0.000",
						BalanceQuantity:  it.BalanceQuantity  || "0.000",
						UOM:              that._toSAPUOM(it.UOM),
						MRNumber:         it.MRNumber         || "",
						Location:         it.Location         || "",
						OldMaterialRef:   it.OldMaterialRef   || "",
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

			var that = this;
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
					var bIsTool = (oHeader.RequestType === "Tools");
					var sToolDesc = bIsTool ? (it.ItemDescription || it.ItemCode || "") : "";
					return {
						GatePassNo:       oHeader.IRGPNo,
						ItemNo:           it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						ItemCode:         bIsTool ? sToolDesc : (it.ItemCode || ""),
						ItemDescription:  bIsTool ? sToolDesc : (it.ItemDescription || ""),
						SentQuantity:     parseFloat(it.SentQuantity     || 0).toFixed(3),
						RecievedQuantity: parseFloat(it.RecievedQuantity || 0).toFixed(3),
						BalanceQuantity:  parseFloat(it.BalanceQuantity  || it.SentQuantity || 0).toFixed(3),
						UOM:              that._toSAPUOM(it.UOM),
						MRNumber:         it.MRNumber        || "",
						Location:         it.Location        || "",
						OldMaterialRef:   it.OldMaterialRef  || "",
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

		onResendBalanceButtonPress: function () {
			var oModel  = this.getView().getModel("irgp");
			var oHeader = oModel.getProperty("/header");
			var aItems  = oModel.getProperty("/items");

			var bHasBalance = aItems.some(function (it) {
				return parseFloat(it.BalanceQuantity) > 0 && parseFloat(it.RecievedQuantity) > 0;
			});

			if (!bHasBalance) {
				sap.m.MessageBox.error("No valid balances to resend. Please ensure you have entered a partial received quantity.");
				return;
			}

			sap.m.MessageBox.confirm("This will accept the received quantities and create new line items for the outstanding balance. The IRGP will be sent back to the user to link a new MRN. Continue?", {
				onClose: function (oAction) {
					if (oAction !== sap.m.MessageBox.Action.OK) { return; }

					var oODataModel = this.getOwnerComponent().getModel();
					if (!oODataModel) { return; }

					var aNewItems = [];
					var iMaxItemNo = 0;
					
					// Find the highest ItemNo to generate new ones
					aItems.forEach(function(it) {
						var iNo = parseInt(it.ItemNo, 10);
						if (!isNaN(iNo) && iNo > iMaxItemNo) {
							iMaxItemNo = iNo;
						}
					});

					aItems.forEach(function (it) {
						var fSent = parseFloat(it.SentQuantity || 0);
						var fRec  = parseFloat(it.RecievedQuantity || 0);
						var fBal  = parseFloat(it.BalanceQuantity || 0);

						if (fBal > 0 && fRec > 0) {
							// Update the original item to be fully received (Sent = Rec)
							it.SentQuantity = fRec.toFixed(3);
							it.BalanceQuantity = "0.000";

							// Create the split item
							iMaxItemNo += 10;
							var oSplitItem = Object.assign({}, it);
							oSplitItem.ItemNo = String(iMaxItemNo).padStart(5, "0");
							oSplitItem.SNo = (iMaxItemNo / 10);
							oSplitItem.SentQuantity = fBal.toFixed(3);
							oSplitItem.RecievedQuantity = "0.000";
							oSplitItem.BalanceQuantity = fBal.toFixed(3);
							oSplitItem.MRNumber = ""; // Clear MRN so user has to relink
							
							aNewItems.push(oSplitItem);
						}
					});

					// Combine original items (now balanced) with the new split items
					var aCombinedItems = aItems.concat(aNewItems);

					// We set status back to Open (PENDING_RESERVATION) so it hits the user's queue again
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
						ReturnedDate:    "", // Clear returned date
						ReturnUser:      "",
						Status:          "Open", 
						MRNumber:        "",
						Message:         "",
						IRGPItmNav:    aCombinedItems.map(function (it) {
							return {
								GatePassNo:       oHeader.IRGPNo,
								ItemNo:           it.ItemNo,
								ItemCode:         it.ItemCode         || "",
								ItemDescription:  it.ItemDescription  || "",
								SentQuantity:     it.SentQuantity,
								RecievedQuantity: it.RecievedQuantity,
								BalanceQuantity:  it.BalanceQuantity,
								UOM:              it.UOM              || "",
								MRNumber:         it.MRNumber         || "",
								Location:         it.Location         || "",
								OldMaterialRef:   it.OldMaterialRef   || "",
								Mp2ItmCode:       it.Mp2ItemCode       || "",
								DefaultBin:       it.DefaultBin        || ""
							};
						})
					};

					sap.ui.core.BusyIndicator.show(0);
					oODataModel.create("/IRGPHdrSet", oPayload, {
						success: function (oData) {
							sap.ui.core.BusyIndicator.hide();
							this._updateCachedStatus(oHeader.IRGPNo, "PENDING_RESERVATION");
							sap.m.MessageBox.success("Balance has been split and resent to the user queue.", {
								onClose: function () {
									oModel.setProperty("/ui/hasPendingChanges", false);
									this._getRouter().navTo("IRGP", { step: "LIST", gpNo: "ALL" });
								}.bind(this)
							});
						}.bind(this),
						error: function (oError) {
							sap.ui.core.BusyIndicator.hide();
							sap.m.MessageBox.error("Failed to resend balance.");
						}.bind(this)
					});
				}.bind(this)
			});
		},

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
								OldMaterialRef:   it.OldMaterialRef   || "",
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
			// If purely digits with leading zeros, trim leading zeros; otherwise keep alphanumeric intact
			if (/^\d+$/.test(sTrim)) {
				return sTrim.replace(/^0+/, "");
			}
			return sTrim;
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
					// Older saves sent DDMMYYYY (e.g. 17092026) — read those back correctly
					if (parseInt(vDate.slice(0, 4), 10) < 1900 && parseInt(vDate.slice(4, 8), 10) >= 1900) {
						return vDate.slice(4, 8) + "-" + vDate.slice(2, 4) + "-" + vDate.slice(0, 2);
					}
					return vDate.slice(0, 4) + "-" + vDate.slice(4, 6) + "-" + vDate.slice(6, 8);
				}
				// Already ISO — trim any time part
				if (/^\d{4}-\d{2}-\d{2}/.test(vDate)) {
					return vDate.slice(0, 10);
				}
			}
			return "";
		},

		// "DD-MM-YYYY" (list display) -> "YYYY-MM-DD"; ISO passes through; "NA"/empty -> ""
		_displayDateToISO: function (sDate) {
			if (!sDate || sDate === "NA") { return ""; }
			var aMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(sDate);
			if (aMatch) { return aMatch[3] + "-" + aMatch[2] + "-" + aMatch[1]; }
			return this._formatSAPDate(sDate);
		},

		_formatSAPDateToDisplay: function (vDate) {
			return this._formatDate(vDate);
		},

		// Format display date to "YYYYMMDD" for backend SAP payloads
		_toSAPDate: function (sDate) {
			if (!sDate) { return ""; }
			return this._dateToYYYYMMDD(sDate);
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

			// If backend failed to update the status but saved the MR Numbers,
			// dynamically derive the correct status. After a "Resend Balance" the
			// already-received lines keep their MRN while the new balance lines have
			// none, so only lines with an open balance decide whether the User still
			// has to link an MRN.
			if (sMappedStatus === "PENDING_RESERVATION") {
				var that = this;
				var aOpenLines = aRaw.filter(function (it) {
					var fSent = parseFloat(it.SentQuantity) || 0;
					var fRec  = parseFloat(it.RecievedQuantity) || 0;
					var fBal  = parseFloat(it.BalanceQuantity);
					if (isNaN(fBal) || (fBal === 0 && fRec === 0)) { fBal = fSent; }
					return fBal > 0;
				});
				var bAwaitingMRN = aOpenLines.some(function (it) {
					return that._sanitizeMRN(it.MRNumber) === "";
				});
				var bAllLinked = aOpenLines.length > 0
					? !bAwaitingMRN
					: this._sanitizeMRN(oData.MRNumber) !== "";
				if (bAllLinked) {
					sMappedStatus = "PENDING_RECEIPT";
				}
				if (oData.RequestType === "Tools") {
					sMappedStatus = "PENDING_RECEIPT";
				}
			}

			var sReqUser = oData.RequestedUser || "";
			var sRetUser = this._resolveFullReturnUser(oData.ReturnUser, sReqUser);

			return {
				IRGPNo:               oData.GatePassNo     || "",
				GEDate:               this._formatSAPDateToDisplay(oData.RequestDate),
				GEDateRaw:            this._formatSAPDate(oData.RequestDate),
				DueDate:              this._formatSAPDateToDisplay(oData.DueDate),
				RevisedDueDate:       this._formatSAPDateToDisplay(oData.RevisedDueDate),
				ReturnedDate:         this._formatSAPDateToDisplay(oData.ReturnedDate) || "NA",
				Department:           oData.Department     || "",
				RequestUser:          sReqUser,
				ReturnUser:           sRetUser,
				ContractName:         oData.ContractName   || "",
				ContractEmployeeName: oData.TAQAEmployee   || "",
				RequestType:          oData.RequestType    || "IRGP",
				Remarks:              oData.Remarks        || "",
				MRNumber:             this._sanitizeMRN(oData.MRNumber),
				StatusCode:           sMappedStatus,
				StatusDisplay:        sMappedStatus === "CLOSED" ? "CLOSED" : "OPEN",
				Message:              oData.Message        || "",
				items: aRaw.map(function (it, i) {
					// SAP item numbers are multiples of 10 ("00010","00020"…)
					var iSNo = it.ItemNo ? Math.round(parseInt(it.ItemNo, 10) / 10) : (i + 1);
					if (iSNo < 1) { iSNo = i + 1; }
					var sMatKey = (it.ItemCode || "").trim();
					var sMatTrim = sMatKey.replace(/^0+/, "");
					var aMaterials = (this.getView().getModel("materials") && this.getView().getModel("materials").getProperty("/results")) || [];
					var oMatFound = aMaterials.find(function (m) {
						var sM = (m.Material || "").trim();
						return sM === sMatKey || (sMatTrim && sM.replace(/^0+/, "") === sMatTrim);
					});
					var sOldMat = it.OldMaterialRef || (oMatFound ? oMatFound.OldMaterialRef : "") || "";
					var bIsTool = (oData.RequestType === "Tools") || (oData.RequestType && oData.RequestType.toUpperCase().indexOf("TOOL") !== -1);
					var sDesc = it.ItemDescription || (bIsTool ? it.ItemCode : "") || (oMatFound ? oMatFound.MaterialName : "") || "";
					var sCode = bIsTool ? sDesc : (it.ItemCode || "");
					var sMatLongDes = it.MatLongDes || it.matLongDes || it.Matlongdes || (oMatFound ? (oMatFound.MatLongDes || oMatFound.matLongDes || oMatFound.Matlongdes) : "") || "";
					var sLongDesc = sMatLongDes;
					return {
						SNo:              iSNo,
						ItemNo:           it.ItemNo || String((i + 1) * 10).padStart(5, "0"),
						ItemCode:         sCode,
						ItemDescription:  sDesc,
						MatLongDes:       sMatLongDes,
						LongDescription:  sLongDesc,
						SentQuantity:     it.SentQuantity     || "0",
						RecievedQuantity: it.RecievedQuantity || "0",
						BalanceQuantity:  it.BalanceQuantity  || "0",
						UOM:              this._mapUOMToDropdownKey(it.UOM || it.uom || it.Uom || ""),
						HSNCode:          it.HSNCode          || "",
						MRNumber:         this._sanitizeMRN(it.MRNumber),
						Location:         it.Location         || "",
						OldMaterialRef:   sOldMat,
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
			oModel.setProperty("/ui/resendBalanceVisible", false);
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
			oModel.setProperty("/ui/resendBalanceVisible", false);

			if (!oModel.getProperty("/header/ReturnedDate")) {
				oModel.setProperty("/header/ReturnedDate", new Date().toISOString().split("T")[0]);
			}
			if (!oModel.getProperty("/header/RevisedDueDate")) {
				oModel.setProperty("/header/RevisedDueDate", oModel.getProperty("/header/DueDate") || "");
			}
			var sCurReq = oModel.getProperty("/header/RequestUser") || "";
			var sCurRet = this._resolveFullReturnUser(oModel.getProperty("/header/ReturnUser"), sCurReq);
			oModel.setProperty("/header/ReturnUser", sCurRet);
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
			oModel.setProperty("/ui/revisedDueDateEditable", true);
			oModel.setProperty("/ui/returnedDateEditable", true);
			oModel.setProperty("/ui/submitVisible",       false);
			oModel.setProperty("/ui/submitResVisible",    false);
			oModel.setProperty("/ui/closeVisible",        true);
			oModel.setProperty("/ui/printVisible",        true);
			oModel.setProperty("/ui/resendBalanceVisible",true);

			// Auto-fill Returned Date and User for the Store Person
			if (!oModel.getProperty("/header/ReturnedDate")) {
				oModel.setProperty("/header/ReturnedDate", new Date().toISOString().split("T")[0]);
			}
			var sCurReq = oModel.getProperty("/header/RequestUser") || "";
			var sCurRet = this._resolveFullReturnUser(oModel.getProperty("/header/ReturnUser"), sCurReq);
			oModel.setProperty("/header/ReturnUser", sCurRet);
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
			oModel.setProperty("/ui/revisedDueDateEditable", false);
			oModel.setProperty("/ui/returnedDateEditable", false);
			oModel.setProperty("/ui/submitVisible",   false);
			oModel.setProperty("/ui/submitResVisible",false);
			oModel.setProperty("/ui/closeVisible",    false);
			oModel.setProperty("/ui/printVisible",        true);
			oModel.setProperty("/ui/resendBalanceVisible", false);

			// Auto-fill Returned Date, Revised Due Date, and Return User (same as edit screen)
			if (!oModel.getProperty("/header/ReturnedDate")) {
				oModel.setProperty("/header/ReturnedDate", new Date().toISOString().split("T")[0]);
			}
			if (!oModel.getProperty("/header/RevisedDueDate")) {
				oModel.setProperty("/header/RevisedDueDate", oModel.getProperty("/header/DueDate") || "");
			}
			var sCurReq = oModel.getProperty("/header/RequestUser") || "";
			var sCurRet = this._resolveFullReturnUser(oModel.getProperty("/header/ReturnUser"), sCurReq);
			oModel.setProperty("/header/ReturnUser", sCurRet);
		},

		_applyEditMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep",          "EDIT");
			oModel.setProperty("/ui/title",                "Edit IRGP");
			oModel.setProperty("/ui/bannerText",           "Edit Mode: Modify IRGP details and resubmit.");
			oModel.setProperty("/ui/bannerType",           "Warning");
			oModel.setProperty("/ui/headerEditable",        true);
			oModel.setProperty("/ui/itemsEditable",         true);
			oModel.setProperty("/ui/mrNumberEditable",      true);
			oModel.setProperty("/ui/revisedDueDateEditable", true);
			oModel.setProperty("/ui/submitVisible",         false);
			oModel.setProperty("/ui/submitResVisible",      false);
			oModel.setProperty("/ui/printVisible",          false);
			oModel.setProperty("/ui/submitEditVisible",     true);

			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel && oUserModel.getProperty("/IsStoreUser");
			if (bIsStoreUser) {
				oModel.setProperty("/ui/receivedQtyEditable",   true);
				oModel.setProperty("/ui/storeStatusEditable",   true);
				oModel.setProperty("/ui/returnedDateEditable",  true);
				oModel.setProperty("/ui/closeVisible",          true);
				oModel.setProperty("/ui/resendBalanceVisible",  true);

				// Auto-fill Returned Date with today's date if not set
				if (!oModel.getProperty("/header/ReturnedDate")) {
					oModel.setProperty("/header/ReturnedDate", new Date().toISOString().split("T")[0]);
				}
				var sCurReq = oModel.getProperty("/header/RequestUser") || "";
				var sCurRet = this._resolveFullReturnUser(oModel.getProperty("/header/ReturnUser"), sCurReq);
				oModel.setProperty("/header/ReturnUser", sCurRet);
			} else {
				oModel.setProperty("/ui/receivedQtyEditable",   false);
				oModel.setProperty("/ui/storeStatusEditable",   false);
				oModel.setProperty("/ui/returnedDateEditable",  false);
				oModel.setProperty("/ui/closeVisible",          false);
				oModel.setProperty("/ui/resendBalanceVisible",  false);
			}
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
				revisedDueDateEditable: sStep === "STORE_CLOSE" || sStep === "EDIT",
				returnedDateEditable:   sStep === "STORE_CLOSE",
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
			var oTable = this.byId("idIRGPListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aObjects.push(oContext.getObject());
					}
				});
			} else {
				aObjects = this.getOwnerComponent().getModel("irgpGlobal").getProperty("/documents") || [];
			}

			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GEDateRaw", dFrom, dTo);

			if (!aObjects.length) {
				MessageToast.show("No record found");
				return;
			}

			var that = this;
			sap.ui.core.BusyIndicator.show(0);
			this._ensureMaterials(aObjects).then(function (aMatList) {
				sap.ui.core.BusyIndicator.hide();
				that._executeExcelDownload(aObjects, aMatList, dFrom, dTo);
			}).catch(function () {
				sap.ui.core.BusyIndicator.hide();
				that._executeExcelDownload(aObjects, [], dFrom, dTo);
			});
		},

		_executeExcelDownload: function (aObjects, aMatList, dFrom, dTo) {
			aMatList = aMatList || [];
			var mMatMap = {};
			aMatList.forEach(function (m) {
				if (m.Material) {
					var sMCode = String(m.Material).trim();
					var sMCodeTrim = sMCode.replace(/^0+/, "");
					var sMCodePad = sMCode.padStart(18, "0");
					var bHasDesc = !!(m.MatLongDes || m.LongDescription);
					var oExisting = mMatMap[sMCode] || mMatMap[sMCodeTrim];
					var bExistingHasDesc = !!(oExisting && (oExisting.MatLongDes || oExisting.LongDescription));

					if (!oExisting || (!bExistingHasDesc && bHasDesc)) {
						mMatMap[sMCode] = m;
						mMatMap[sMCodeTrim] = m;
						if (sMCode.length < 18) {
							mMatMap[sMCodePad] = m;
						}
					}
				}
				if (m.OldMaterialRef) {
					var sHex = String(m.OldMaterialRef).trim();
					var oExistingHex = mMatMap[sHex];
					var bExistingHexHasDesc = !!(oExistingHex && (oExistingHex.MatLongDes || oExistingHex.LongDescription));
					var bHasDescHex = !!(m.MatLongDes || m.LongDescription);
					if (!oExistingHex || (!bExistingHexHasDesc && bHasDescHex)) {
						mMatMap[sHex] = m;
					}
				}
			});

			var aRows = [];
			aObjects.forEach(function (o) {
				var aItems = o.items || [];
				if (aItems.length === 0) {
					aRows.push({
						"IRGP No": o.IRGPNo || "",
						"Req Date": o.GEDate || "",
						"Req Type": o.RequestType || "",
						"Item": "",
						"Location": "",
						"Hexagon Code": "",
						"Mp2ItemCode": "",
						"Description": "",
						"Long Description": "",
						"DefaultBin": "",
						"QTY Issued": "",
						"Qty Received": "",
						"Balance Qty": "",
						"UOM": "",
						"MRNumber": "",
						"Due Date": o.DueDate || "",
						"Extended Due Date": o.RevisedDueDate || "",
						"Return Date": o.ReturnedDate || "",
						"Req User": o.RequestUser || "",
						"Requester Department": o.Department || "",
						"ContractName": o.ContractName || "",
						"Contract/MEIL Employee Name": o.ContractEmployeeName || "",
						"Status": o.StatusCode === "CLOSED" ? "CLOSED" : "OPEN",
						"Remarks": o.Remarks || ""
					});
				} else {
					aItems.forEach(function (item) {
						var sMatKey = String(item.ItemCode || item.Material || "").trim();
						var sHexKey = String(item.OldMaterialRef || item.HexagonCode || "").trim();
						var oMat = mMatMap[sMatKey] || mMatMap[sMatKey.replace(/^0+/, "")] || mMatMap[sMatKey.padStart(18, "0")] || (sHexKey ? mMatMap[sHexKey] : null) || {};
						var sHexCode = item.OldMaterialRef || item.HexagonCode || oMat.OldMaterialRef || "";
						var sRawLongDesc = (oMat && (oMat.MatLongDes || oMat.LongDescription)) || item.MatLongDes || item.LongDescription || "";
						var sLongDesc = sRawLongDesc ? String(sRawLongDesc).replace(/<\(><<\)>!-- RICH TEXT -->/gi, "").replace(/<[^>]*>/g, "").trim() : "";
						var sDesc = item.ItemDescription || (oMat ? oMat.MaterialName : "") || "";

						console.warn("=== EXCEL ITEM LONG DESCRIPTION ===", {
							IRGPNo: o.IRGPNo,
							ItemCode: item.ItemCode,
							RawLongDescFromBackend: sRawLongDesc,
							CleanedLongDesc: sLongDesc,
							MatchedMaterialMaster: oMat
						});

						aRows.push({
							"IRGP No": o.IRGPNo || "",
							"Req Date": o.GEDate || "",
							"Req Type": o.RequestType || "",
							"Item": item.ItemCode || "",
							"Location": item.Location || "",
							"Hexagon Code": sHexCode,
							"Mp2ItemCode": item.Mp2ItemCode || "",
							"Description": sDesc,
							"Long Description": sLongDesc,
							"DefaultBin": item.DefaultBin || "",
							"QTY Issued": item.SentQuantity || "0",
							"Qty Received": item.RecievedQuantity || "0",
							"Balance Qty": item.BalanceQuantity || "0",
							"UOM": item.UOM || "",
							"MRNumber": item.MRNumber || "",
							"Due Date": o.DueDate || "",
							"Extended Due Date": o.RevisedDueDate || "",
							"Return Date": o.ReturnedDate || "",
							"Req User": o.RequestUser || "",
							"Requester Department": o.Department || "",
							"ContractName": o.ContractName || "",
							"Contract/MEIL Employee Name": o.ContractEmployeeName || "",
							"Status": o.StatusCode === "CLOSED" ? "CLOSED" : "OPEN",
							"Remarks": o.Remarks || ""
						});
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
			ExcelExport.download(aRows, sSheetName, sFileName, 24);
		},  

		onFilterIRGPList: function () {
			this._applyTableFilters();
		},

		onDateFilterChange: function () {
			this._applyTableFilters();
		},

		onCopyData: function () {
			var oTable = this.byId("idIRGPListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aObjects.push(oContext.getObject());
					}
				});
			} else {
				aObjects = this.getOwnerComponent().getModel("irgpGlobal").getProperty("/documents") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			
			var aHeaders = [
				"IRGP Date", "IRGP No", "IRGP Type", "Due Date", "Ret Date", "Req User", "Req Dept", "Contract Name", "Contract Employee Name", "Status",
				"Item SNo", "Item Code", "Item Description", "Sent Qty", "Received Qty", "Balance Qty", "UOM", "Item MRN"
			];
			var aLines = [aHeaders.join("\t")];
			aObjects.forEach(function (o) {
				var aHeaderFields = [
					o.GEDate || "",
					o.IRGPNo || "",
					o.RequestType || "",
					o.DueDate || "",
					o.ReturnedDate || "",
					o.RequestUser || "",
					o.Department || "",
					o.ContractName || "",
					o.ContractEmployeeName || "",
					o.StatusCode === "CLOSED" ? "CLOSED" : "OPEN"
				];

				var aItems = o.items || [];
				if (aItems.length === 0) {
					var aRow = aHeaderFields.concat(["", "", "", "", "", "", "", ""]);
					aLines.push(aRow.join("\t"));
				} else {
					aItems.forEach(function (item) {
						var aRow = aHeaderFields.concat([
							item.SNo || "",
							item.ItemCode || "",
							item.ItemDescription || "",
							item.SentQuantity || "0",
							item.RecievedQuantity || "0",
							item.BalanceQuantity || "0",
							item.UOM || "",
							item.MRNumber || ""
						]);
						aLines.push(aRow.join("\t"));
					});
				}
			});
			var sTsv = aLines.join("\n");
			
			navigator.clipboard.writeText(sTsv).then(function () {
				sap.m.MessageToast.show("Data copied to clipboard!");
			}).catch(function (err) {
				sap.m.MessageToast.show("Failed to copy data: " + err);
			});
		},

		onPrintList: function () {
			var oTable = this.byId("idIRGPListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aObjects.push(oContext.getObject());
					}
				});
			} else {
				aObjects = this.getOwnerComponent().getModel("irgpGlobal").getProperty("/documents") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}

			var sHtml = "<html><head><title>Internal Returnable Gate Passes List</title>";
			sHtml += "<style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }";
			sHtml += "</style></head><body>";
			sHtml += "<h2>Internal Returnable Gate Passes List</h2>";
			sHtml += "<table><thead><tr>";
			sHtml += "<th>IRGP Date</th><th>IRGP No</th><th>IRGP Type</th><th>Due Date</th><th>Ret Date</th><th>Req User</th><th>Req Dept</th><th>Contract Name</th><th>Contract Employee Name</th><th>Status</th>";
			sHtml += "<th>Item SNo</th><th>Item Code</th><th>Item Description</th><th>Sent Qty</th><th>Received Qty</th><th>Balance Qty</th><th>UOM</th><th>Item MRN</th>";
			sHtml += "</tr></thead><tbody>";

			aObjects.forEach(function (o) {
				var sRowPrefix = "";
				sRowPrefix += "<td>" + (o.GEDate || "") + "</td>";
				sRowPrefix += "<td>" + (o.IRGPNo || "") + "</td>";
				sRowPrefix += "<td>" + (o.RequestType || "") + "</td>";
				sRowPrefix += "<td>" + (o.DueDate || "") + "</td>";
				sRowPrefix += "<td>" + (o.ReturnedDate || "") + "</td>";
				sRowPrefix += "<td>" + (o.RequestUser || "") + "</td>";
				sRowPrefix += "<td>" + (o.Department || "") + "</td>";
				sRowPrefix += "<td>" + (o.ContractName || "") + "</td>";
				sRowPrefix += "<td>" + (o.ContractEmployeeName || "") + "</td>";
				sRowPrefix += "<td>" + (o.StatusCode === "CLOSED" ? "CLOSED" : "OPEN") + "</td>";

				var aItems = o.items || [];
				if (aItems.length === 0) {
					sHtml += "<tr>" + sRowPrefix + "<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>";
				} else {
					aItems.forEach(function (item) {
						sHtml += "<tr>";
						sHtml += sRowPrefix;
						sHtml += "<td>" + (item.SNo || "") + "</td>";
						sHtml += "<td>" + (item.ItemCode || "") + "</td>";
						sHtml += "<td>" + (item.ItemDescription || "") + "</td>";
						sHtml += "<td>" + (item.SentQuantity || "0") + "</td>";
						sHtml += "<td>" + (item.RecievedQuantity || "0") + "</td>";
						sHtml += "<td>" + (item.BalanceQuantity || "0") + "</td>";
						sHtml += "<td>" + (item.UOM || "") + "</td>";
						sHtml += "<td>" + (item.MRNumber || "") + "</td>";
						sHtml += "</tr>";
					});
				}
			});

			sHtml += "</tbody></table></body></html>";

			var oWindow = window.open("", "_blank");
			oWindow.document.write(sHtml);
			oWindow.document.close();
			oWindow.focus();
			setTimeout(function () {
				oWindow.print();
				oWindow.close();
			}, 500);
		},

		_applyTableFilters: function () {
			var oTable = this.byId("idIRGPListTable");
			if (!oTable) { return; }
			var oBinding = oTable.getBinding("items");
			if (!oBinding) { return; }

			var aFilters = [];

			// 1. Status Filter
			var sTabKey = this.byId("idIRGPIconTabBar").getSelectedKey();
			if (sTabKey && sTabKey !== "ALL") {
				aFilters.push(new sap.ui.model.Filter("StatusCode", sap.ui.model.FilterOperator.EQ, sTabKey));
			}

			// 2. Date Range Filter
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			if (dFrom || dTo) {
				var fnFormat = function (d) {
					return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
				};
				if (dFrom && dTo) {
					aFilters.push(new sap.ui.model.Filter("GEDateRaw", sap.ui.model.FilterOperator.BT, fnFormat(dFrom), fnFormat(dTo)));
				} else if (dFrom) {
					aFilters.push(new sap.ui.model.Filter("GEDateRaw", sap.ui.model.FilterOperator.GE, fnFormat(dFrom)));
				} else if (dTo) {
					aFilters.push(new sap.ui.model.Filter("GEDateRaw", sap.ui.model.FilterOperator.LE, fnFormat(dTo)));
				}
			}

			// 3. Search Filter
			var sQuery = this.byId("idIRGPSearchField") ? this.byId("idIRGPSearchField").getValue() : "";
			if (sQuery && sQuery.trim() !== "") {
				var aSearchFilters = [
					new sap.ui.model.Filter("IRGPNo", sap.ui.model.FilterOperator.Contains, sQuery),
					new sap.ui.model.Filter("RequestUser", sap.ui.model.FilterOperator.Contains, sQuery),
					new sap.ui.model.Filter("ContractEmployeeName", sap.ui.model.FilterOperator.Contains, sQuery),
					new sap.ui.model.Filter("ContractName", sap.ui.model.FilterOperator.Contains, sQuery),
					new sap.ui.model.Filter("Department", sap.ui.model.FilterOperator.Contains, sQuery),
					new sap.ui.model.Filter("RequestType", sap.ui.model.FilterOperator.Contains, sQuery)
				];
				aFilters.push(new sap.ui.model.Filter({
					filters: aSearchFilters,
					and: false
				}));
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
				SentQuantity: "", RecievedQuantity: "0", BalanceQuantity: "0",
				UOM: "", MRNumber: "", Location: "", OldMaterialRef: "", HSNCode: "", Mp2ItemCode: "", DefaultBin: ""
			});
			oModel.setProperty("/items", aItems);
			oModel.setProperty("/ui/hasPendingChanges", true);
			MessageToast.show("Row added.");
		},

		_ensureMaterials: function (aObjects) {
			var that = this;
			return new Promise(function (resolve) {
				var oODataModel = that.getOwnerComponent().getModel();
				if (!oODataModel) {
					return resolve([]);
				}

				var oMaterialsModel = that.getView().getModel("materials");
				if (!oMaterialsModel) {
					oMaterialsModel = new JSONModel({ results: [] });
					oMaterialsModel.setSizeLimit(100000);
					that.getView().setModel(oMaterialsModel, "materials");
				}

				var aCurrentList = oMaterialsModel.getProperty("/results") || [];
				var mExisting = {};
				aCurrentList.forEach(function (m) {
					if (m.Material) {
						var sM = String(m.Material).trim();
						mExisting[sM] = m;
						mExisting[sM.replace(/^0+/, "")] = m;
					}
					if (m.OldMaterialRef) {
						mExisting[String(m.OldMaterialRef).trim()] = m;
					}
				});

				// Collect unique material codes from aObjects that need MatLongDes
				var aNeededCodes = [];
				(aObjects || []).forEach(function (o) {
					(o.items || []).forEach(function (it) {
						var c = (it.ItemCode || it.Material || "").trim();
						if (c) {
							var cTrim = c.replace(/^0+/, "");
							var oFound = mExisting[c] || mExisting[cTrim];
							if (!oFound || !oFound.MatLongDes) {
								if (aNeededCodes.indexOf(c) === -1) {
									aNeededCodes.push(c);
								}
								if (cTrim && aNeededCodes.indexOf(cTrim) === -1) {
									aNeededCodes.push(cTrim);
								}
							}
						}
					});
				});

				// If all materials are already in memory with MatLongDes, resolve immediately
				if (aNeededCodes.length === 0 && aCurrentList.length > 0) {
					return resolve(aCurrentList);
				}

				var aUniqueCodes = [];
				aNeededCodes.forEach(function (c) {
					if (aUniqueCodes.indexOf(c) === -1) { aUniqueCodes.push(c); }
				});

				var fnProcessMaterialItem = function (m) {
					var sOldMat = m.OldMaterialRef || m.Bismt || m.BISMT || m.OldMatnr || m.OldMaterialCode || m.HexagonCode || "";
					var sHsn = m.HSNCode || m.HsnCode || m.ControlCode || m.Steuc || "";
					var sHsnDesc = m.HSNDesc || m.HsnDesc || "";
					var sRawLongDes = m.MatLongDes || m.matLongDes || m.Matlongdes || "";
					var sMatLongDes = sRawLongDes ? String(sRawLongDes).replace(/<\(><<\)>!-- RICH TEXT -->/gi, "").replace(/<[^>]*>/g, "").trim() : "";
					return {
						Material: m.Material || m.Matnr || "",
						MaterialName: m.MaterialDesc || m.MaterialDescription || m.Arktx || m.MaterialName || m.Maktx || "",
						MatLongDes: sMatLongDes,
						LongDescription: sMatLongDes,
						UOM: m.UOM || m.Meins || "",
						Location: m.Location || m.Lgort || m.StorageLocation || "",
						OldMaterialRef: sOldMat,
						HSNCode: sHsn,
						HsnCode: sHsn,
						HSNDesc: sHsnDesc,
						HsnDesc: sHsnDesc,
						Mp2ItemCode: m.MP2ItemCode || m.Mp2ItemCode || m.Mp2ItmCode || m.Mp2itemcode || "",
						DefaultBin: m.DefaultBin || m.Bin || m.Lgpla || m.Defaultbin || ""
					};
				};

				var fnFetchSingleMaterial = function (sCode) {
					return new Promise(function (res) {
						var sActivePlant = that.getUserPlant() || "2301";
						var aF = [
							new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sActivePlant),
							new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.EQ, sCode)
						];
						oODataModel.read("/ZMaterialSet", {
							filters: aF,
							success: function (oData) {
								var aResults = oData.results || [];
								console.warn("Fetched single material from OData for:", sCode, aResults);
								if (aResults.length > 0) {
									return res(aResults.map(fnProcessMaterialItem));
								}
								if (sCode.length < 18) {
									var aFPadded = [
										new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sActivePlant),
										new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.EQ, sCode.padStart(18, "0"))
									];
									oODataModel.read("/ZMaterialSet", {
										filters: aFPadded,
										success: function (oDataPadded) {
											var aResultsPadded = oDataPadded.results || [];
											console.warn("Fetched padded material from OData for:", sCode, aResultsPadded);
											res(aResultsPadded.map(fnProcessMaterialItem));
										},
										error: function (err) {
											console.warn("Error fetching padded material for:", sCode, err);
											res([]);
										}
									});
								} else {
									res([]);
								}
							},
							error: function (err) {
								console.warn("Error fetching single material for:", sCode, err);
								res([]);
							}
						});
					});
				};

				Promise.all(aUniqueCodes.map(fnFetchSingleMaterial)).then(function (aArrays) {
					aArrays.forEach(function (arr) {
						arr.forEach(function (item) {
							var sKey = String(item.Material).trim();
							var sKeyTrim = sKey.replace(/^0+/, "");
							var bFound = false;
							aCurrentList.forEach(function (c) {
								var cKey = String(c.Material).trim();
								if (cKey === sKey || cKey.replace(/^0+/, "") === sKeyTrim) {
									bFound = true;
									if (item.MatLongDes) {
										c.MatLongDes = item.MatLongDes;
										c.LongDescription = item.LongDescription;
									}
								}
							});
							if (!bFound) {
								aCurrentList.push(item);
							}
						});
					});

					oMaterialsModel.setProperty("/results", aCurrentList);
					resolve(aCurrentList);
				});
			});
		},

		_loadMaterials: function (fnCallback) {
			var oMaterialsModel = this.getView().getModel("materials");
			if (!oMaterialsModel) {
				oMaterialsModel = new JSONModel({ results: [] });
				oMaterialsModel.setSizeLimit(100000);
				this.getView().setModel(oMaterialsModel, "materials");
			} else {
				oMaterialsModel.setSizeLimit(100000);
			}

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				if (typeof fnCallback === "function") { fnCallback([]); }
				return;
			}

			var sPlant = this.getUserPlant() || "2301";

			var aFilters = sPlant ? [new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant)] : [];

			var that = this;
			oODataModel.read("/ZMaterialSet", {
				filters: aFilters,
				success: function (oData) {
					var aNormalized = (oData.results || []).map(function (m) {
						var sOldMat = m.OldMaterialRef || m.Bismt || m.BISMT || m.OldMatnr || m.OldMaterialCode || m.HexagonCode || "";
						var sHsn = m.HSNCode || m.HsnCode || m.ControlCode || m.Steuc || "";
						var sHsnDesc = m.HSNDesc || m.HsnDesc || "";
						var sRawLongDes = m.MatLongDes || m.matLongDes || m.Matlongdes || "";
						var sMatLongDes = sRawLongDes ? String(sRawLongDes).replace(/<\(><<\)>!-- RICH TEXT -->/gi, "").replace(/<[^>]*>/g, "").trim() : "";
						return {
							Material: m.Material || m.Matnr || "",
							MaterialName: m.MaterialDesc || m.MaterialDescription || m.Arktx || m.MaterialName || m.Maktx || "",
							MatLongDes: sMatLongDes,
							LongDescription: sMatLongDes,
							UOM: m.UOM || m.Meins || "",
							Location: m.Location || m.Lgort || m.StorageLocation || "",
							OldMaterialRef: sOldMat,
							HSNCode: sHsn,
							HsnCode: sHsn,
							HSNDesc: sHsnDesc,
							HsnDesc: sHsnDesc,
							Mp2ItemCode: m.MP2ItemCode || m.Mp2ItemCode || m.Mp2ItmCode || m.Mp2itemcode || "",
							DefaultBin: m.DefaultBin || m.Bin || m.Lgpla || m.Defaultbin || ""
						};
					});
					oMaterialsModel.setProperty("/results", aNormalized);
					if (typeof fnCallback === "function") { fnCallback(aNormalized); }
				},
				error: function () {
					if (typeof fnCallback === "function") { fnCallback([]); }
				}
			});
		},

		onMaterialValueHelp: function (oEvent) {
			this._oInputSource = oEvent.getSource();
			this._oRowContext = this._oInputSource.getBindingContext("irgp");

			if (!this._pMaterialValueHelp) {
				this._pMaterialValueHelp = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.MaterialValueHelp",
					controller: this
				}).then(function (oDialog) {
					this.getView().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}

			this._pMaterialValueHelp.then(function (oDialog) {
				oDialog.getBinding("items").filter([]);
				oDialog.open();
			});
		},

		onMaterialValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new sap.ui.model.Filter({
				filters: [
					new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.Contains, sValue),
					new sap.ui.model.Filter("MaterialName", sap.ui.model.FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onMaterialValueHelpConfirm: function (oEvent) {
			var oSelectedItem = oEvent.getParameter("selectedItem");
			if (!oSelectedItem) {
				return;
			}

			var oSelectedMaterial = oSelectedItem.getBindingContext("materials").getObject();
			var oModel = this.getView().getModel("irgp");
			var sPath = this._oRowContext.getPath();

			oModel.setProperty(sPath + "/ItemCode", oSelectedMaterial.Material);
			oModel.setProperty(sPath + "/ItemDescription", oSelectedMaterial.MaterialName);
			oModel.setProperty(sPath + "/MatLongDes", oSelectedMaterial.MatLongDes || oSelectedMaterial.LongDescription || "");
			oModel.setProperty(sPath + "/LongDescription", oSelectedMaterial.LongDescription || oSelectedMaterial.MatLongDes || "");
			oModel.setProperty(sPath + "/UOM", oSelectedMaterial.UOM);
			oModel.setProperty(sPath + "/Location", oSelectedMaterial.Location || "");
			oModel.setProperty(sPath + "/OldMaterialRef", oSelectedMaterial.OldMaterialRef || "");
			oModel.setProperty(sPath + "/HSNCode", oSelectedMaterial.HSNCode || "");
			oModel.setProperty(sPath + "/Mp2ItemCode", oSelectedMaterial.Mp2ItemCode || "");
			oModel.setProperty(sPath + "/DefaultBin", oSelectedMaterial.DefaultBin || "");
		},

		onToolDescriptionChange: function (oEvent) {
			var oInput = oEvent.getSource();
			var sVal = (oInput.getValue() || "").trim();
			var oRowCtx = oInput.getBindingContext("irgp");
			if (!oRowCtx) return;

			var oModel = this.getView().getModel("irgp");
			var sPath = oRowCtx.getPath();
			oModel.setProperty(sPath + "/ItemDescription", sVal);
			oModel.setProperty(sPath + "/ItemCode", sVal);
			oModel.setProperty("/ui/hasPendingChanges", true);
		},

		onItemCodeChange: function (oEvent) {
			var oInput = oEvent.getSource();
			var sVal = (oInput.getValue() || "").trim();
			var oRowCtx = oInput.getBindingContext("irgp");
			if (!oRowCtx) return;

			var oModel = this.getView().getModel("irgp");
			var sPath = oRowCtx.getPath();
			var sReqType = oModel.getProperty("/header/RequestType");
			if (sReqType === "Tools") {
				oModel.setProperty(sPath + "/ItemDescription", sVal);
				oModel.setProperty(sPath + "/ItemCode", sVal);
				return;
			}

			if (!sVal) {
				oModel.setProperty(sPath + "/ItemDescription", "");
				oModel.setProperty(sPath + "/UOM", "");
				oModel.setProperty(sPath + "/Location", "");
				oModel.setProperty(sPath + "/OldMaterialRef", "");
				oModel.setProperty(sPath + "/HSNCode", "");
				oModel.setProperty(sPath + "/Mp2ItemCode", "");
				oModel.setProperty(sPath + "/DefaultBin", "");
				return;
			}

			var oMaterialsModel = this.getView().getModel("materials");
			var aResults = oMaterialsModel ? (oMaterialsModel.getProperty("/results") || []) : [];
			var oFound = aResults.find(function (m) {
				return (m.Material || "").trim().toLowerCase() === sVal.toLowerCase();
			});

			if (oFound) {
				oModel.setProperty(sPath + "/ItemCode", oFound.Material);
				oModel.setProperty(sPath + "/ItemDescription", oFound.MaterialName);
				oModel.setProperty(sPath + "/MatLongDes", oFound.MatLongDes || oFound.LongDescription || "");
				oModel.setProperty(sPath + "/LongDescription", oFound.LongDescription || oFound.MatLongDes || "");
				oModel.setProperty(sPath + "/UOM", oFound.UOM);
				oModel.setProperty(sPath + "/Location", oFound.Location || "");
				oModel.setProperty(sPath + "/OldMaterialRef", oFound.OldMaterialRef || "");
				oModel.setProperty(sPath + "/HSNCode", oFound.HSNCode || "");
				oModel.setProperty(sPath + "/Mp2ItemCode", oFound.Mp2ItemCode || "");
				oModel.setProperty(sPath + "/DefaultBin", oFound.DefaultBin || "");
			} else {
				oModel.setProperty(sPath + "/ItemDescription", "");
				oModel.setProperty(sPath + "/MatLongDes", "");
				oModel.setProperty(sPath + "/LongDescription", "");
				oModel.setProperty(sPath + "/UOM", "");
				oModel.setProperty(sPath + "/Location", "");
				oModel.setProperty(sPath + "/OldMaterialRef", "");
				oModel.setProperty(sPath + "/HSNCode", "");
				oModel.setProperty(sPath + "/Mp2ItemCode", "");
				oModel.setProperty(sPath + "/DefaultBin", "");
			}
		},

		onMaterialValueHelpCancel: function () {},

		onMaximoValueHelp: function (oEvent) {
			this._oInputSource = oEvent.getSource();
			this._oRowContext = this._oInputSource.getBindingContext("irgp");

			if (!this._pMaximoValueHelp) {
				this._pMaximoValueHelp = sap.ui.core.Fragment.load({
					id: this.getView().getId(),
					name: "zgpms.meilpower.com.view.fragments.MaximoValueHelp",
					controller: this
				}).then(function (oDialog) {
					this.getView().addDependent(oDialog);
					return oDialog;
				}.bind(this));
			}

			this._pMaximoValueHelp.then(function (oDialog) {
				oDialog.getBinding("items").filter([]);
				oDialog.open();
			});
		},

		onMaximoValueHelpSearch: function (oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new sap.ui.model.Filter({
				filters: [
					new sap.ui.model.Filter("OldMaterialRef", sap.ui.model.FilterOperator.Contains, sValue),
					new sap.ui.model.Filter("HSNCode", sap.ui.model.FilterOperator.Contains, sValue),
					new sap.ui.model.Filter("MaterialName", sap.ui.model.FilterOperator.Contains, sValue),
					new sap.ui.model.Filter("Material", sap.ui.model.FilterOperator.Contains, sValue)
				],
				and: false
			});
			oEvent.getSource().getBinding("items").filter([oFilter]);
		},

		onMaximoCodeChange: function (oEvent) {
			var oInput = oEvent.getSource();
			var sVal = (oInput.getValue() || "").trim();
			var oRowCtx = oInput.getBindingContext("irgp");
			if (!oRowCtx) return;

			var oModel = this.getView().getModel("irgp");
			var sPath = oRowCtx.getPath();

			if (!sVal) {
				oModel.setProperty(sPath + "/ItemCode", "");
				oModel.setProperty(sPath + "/ItemDescription", "");
				oModel.setProperty(sPath + "/MatLongDes", "");
				oModel.setProperty(sPath + "/LongDescription", "");
				oModel.setProperty(sPath + "/UOM", "");
				oModel.setProperty(sPath + "/Location", "");
				oModel.setProperty(sPath + "/OldMaterialRef", "");
				oModel.setProperty(sPath + "/HSNCode", "");
				oModel.setProperty(sPath + "/Mp2ItemCode", "");
				oModel.setProperty(sPath + "/DefaultBin", "");
				return;
			}

			var oMaterialsModel = this.getView().getModel("materials");
			var aResults = oMaterialsModel ? (oMaterialsModel.getProperty("/results") || []) : [];
			var oFound = aResults.find(function (m) {
				return (m.OldMaterialRef || "").trim().toLowerCase() === sVal.toLowerCase();
			});

			if (oFound) {
				oModel.setProperty(sPath + "/ItemCode", oFound.Material);
				oModel.setProperty(sPath + "/ItemDescription", oFound.MaterialName);
				oModel.setProperty(sPath + "/MatLongDes", oFound.MatLongDes || oFound.LongDescription || "");
				oModel.setProperty(sPath + "/LongDescription", oFound.LongDescription || oFound.MatLongDes || "");
				oModel.setProperty(sPath + "/UOM", oFound.UOM);
				oModel.setProperty(sPath + "/Location", oFound.Location || "");
				oModel.setProperty(sPath + "/OldMaterialRef", oFound.OldMaterialRef || sVal);
				oModel.setProperty(sPath + "/HSNCode", oFound.HSNCode || "");
				oModel.setProperty(sPath + "/Mp2ItemCode", oFound.Mp2ItemCode || "");
				oModel.setProperty(sPath + "/DefaultBin", oFound.DefaultBin || "");
			} else {
				oModel.setProperty(sPath + "/OldMaterialRef", sVal);
			}
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

		_printDocument: async function (oHeader, aItems, bGetBase64) {
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

			// ── Old Maximo Code: backend doesn't return it on saved IRGPs, so fall
			//    back to the loaded material master (matched by SAP item code) ──
			var oMaterialsModel = this.getView().getModel("materials");
			var aMaterials = (oMaterialsModel && oMaterialsModel.getProperty("/results")) || [];
			var fnMaximoCode = function (it) {
				if (it.OldMaterialRef) { return it.OldMaterialRef; }
				var sCode = (it.ItemCode || "").trim();
				var oMat = sCode && aMaterials.find(function (m) { return m.Material === sCode; });
				return (oMat && oMat.OldMaterialRef) || "";
			};

			// ── Prepared Name = store person logged in ───────────────────────────
			var oUserModel = sap.ui.getCore().getModel("user");
			var sPreparedName = oUserModel
				? (oUserModel.getProperty("/fullName") || oUserModel.getProperty("/id") || oUserModel.getProperty("/User") || "")
				: "";

			var bIsTools = (oHeader.RequestType === "Tools") ||
				(oHeader.RequestType && oHeader.RequestType.toUpperCase().indexOf("TOOL") !== -1);

			// ── Build items rows (pad to at least 5) ─────────────────────────────
			var tableData = (aItems || []).map(function (it, i) {
				var bItemIsTool = bIsTools || (!it.ItemDescription && it.ItemCode && isNaN(it.ItemCode));
				var sItemCode = bItemIsTool ? "" : (it.ItemCode || "");
				var sDesc = bItemIsTool ? (it.ItemDescription || it.ItemCode || "") : (it.ItemDescription || "");
				var sMaximo = bItemIsTool ? "" : fnMaximoCode(it);
				var sLoc = it.Location || "";
				var sMp2 = it.Mp2ItemCode || "";
				var sBin = it.DefaultBin || "";
				return [
					i + 1,
					sItemCode,
					sMaximo,
					sLoc,
					sMp2,
					sDesc,
					parseFloat(it.SentQuantity || 0).toFixed(2),
					it.UOM             || "",
					sBin
				];
			});
			while (tableData.length < 5) { tableData.push(["", "", "", "", "", "", "", "", ""]); }

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
				var rightLabelX = pageWidth - margin - 62;
				var rightValueX = pageWidth - margin - 2;

				// IRGP No – bold & increased size
				doc.setFont("helvetica", "bold"); doc.setFontSize(11.5);
				doc.text("IRGP No: " + (oHeader.IRGPNo || ""), margin, y);
				// Tagline below – bold & increased size
				doc.setFont("helvetica", "bold"); doc.setFontSize(9);
				doc.text("To take out the following material", margin, y + 5.5);

				// Right: Req Dept – bold & increased size
				doc.setFont("helvetica", "bold"); doc.setFontSize(10);
				doc.text("Req Dept:", rightLabelX, y);
				doc.text(oHeader.Department || "", rightValueX, y, { align: "right" });

				// GP Date – bold & increased size
				doc.setFont("helvetica", "bold"); doc.setFontSize(10);
				doc.text("GP Date:", rightLabelX, y + 5);
				doc.text(fmtDate(oHeader.GEDate), rightValueX, y + 5, { align: "right" });

				// Due Date – bold & increased size
				doc.setFont("helvetica", "bold"); doc.setFontSize(10);
				doc.text("Due Date:", rightLabelX, y + 10);
				doc.text(fmtDate(oHeader.DueDate), rightValueX, y + 10, { align: "right" });
			};

			// ── Table starting Y ─────────────────────────────────────────────────
			var tableStartY = margin + 14 + 7 + 15;  // header block height ≈ 51mm

			// ── Draw the items table ─────────────────────────────────────────────
			doc.autoTable({
				startY: tableStartY,
				head: [['S.No', 'SAP Item Code', 'Maximo Code', 'Location', 'Mp2ItemCode', 'DESCRIPTION', 'QTY', 'UOM', 'DefaultBin']],
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
					1: { cellWidth: 30,    halign: 'left'   },
					2: { cellWidth: 30,    halign: 'left'   },
					3: { cellWidth: 20,    halign: 'left'   },
					4: { cellWidth: 28,    halign: 'left'   },
					5: { cellWidth: 'auto', halign: 'left' },
					6: { cellWidth: 16,    halign: 'center' },
					7: { cellWidth: 16,    halign: 'left'   },
					8: { cellWidth: 28,    halign: 'left'   }
				},
				margin: { top: tableStartY, left: margin, right: margin, bottom: 25 },
				didDrawPage: function () { drawHeader(); }
			});

			// ── Remarks row (full width, below table) ────────────────────────────
			var finalY = doc.lastAutoTable.finalY;
			var remH   = 8;
			var sigY   = pageHeight - 22;

			// If remarks + footer info would collide with signature area, push to new page
			if (finalY + remH + 35 > sigY) {
				doc.addPage();
				drawHeader();
				finalY = tableStartY;
			}

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
			var footY = finalY + remH + 8;
			var halfW = cW / 2;

			// Left: Prepared Name – bold
			doc.setFont("helvetica", "bold"); doc.setFontSize(9);
			doc.text("Prepared Name:", margin, footY);
			doc.text(sPreparedName, margin + 35, footY);

			// Right: Req Name – bold
			doc.setFont("helvetica", "bold"); doc.setFontSize(9);
			doc.text("Req Name:", margin + halfW, footY);
			doc.text(oHeader.RequestUser || "", margin + halfW + 24, footY);

			// Left: Contract Name – bold
			doc.setFont("helvetica", "bold"); doc.setFontSize(9);
			doc.text("Contract Name:", margin, footY + 8);
			var sContract = doc.splitTextToSize(oHeader.ContractName || "", halfW - 37);
			doc.text(sContract, margin + 35, footY + 8);

			// Right: Contract/Employee Name – bold
			doc.setFont("helvetica", "bold"); doc.setFontSize(9);
			doc.text("Contract/Employee Name:", margin + halfW, footY + 8);
			var sEmpName = doc.splitTextToSize(oHeader.ContractEmployeeName || "", halfW - 53);
			doc.text(sEmpName, margin + halfW + 51, footY + 8);

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

			if (bGetBase64 === true) {
				return doc.output('datauristring').split(',')[1];
			}

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
				oDoc.StatusDisplay = sNewStatusCode === "CLOSED" ? "CLOSED" : "OPEN";
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
		},

		_loadVendors: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = oUserModel ? (oUserModel.getProperty("/plant") || oUserModel.getProperty("/Plant") || "") : "";
			if (!sPlant) { return; }

			var aFilters = [new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant)];
			var that = this;

			oODataModel.read("/ZVendorSet", {
				filters: aFilters,
				success: function (oData) {
					var aNormalized = (oData.results || []).map(function (v) {
						var sName = v.Name || v.VendorName || v.Name1 || "";
						var sCode = v.Vendor || v.Lifnr || "";
						var sText = sCode ? (sCode + " - " + sName) : sName;
						return {
							key: sName,
							text: sText
						};
					});
					var oModel = that.getView().getModel("irgp");
					if (oModel) {
						oModel.setProperty("/dropdowns/contracts", aNormalized);
					}
				},
				error: function () {
					var oModel = that.getView().getModel("irgp");
					if (oModel) {
						oModel.setProperty("/dropdowns/contracts", []);
					}
				}
			});
		},

		_loadDepartments: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			var oIrgpModel = this.getView().getModel("irgp");
			var sPlant = (oIrgpModel && oIrgpModel.getProperty("/header/Plant")) || this.getUserPlant() || "3121";
			var aFilters = sPlant ? [new sap.ui.model.Filter("Plant", sap.ui.model.FilterOperator.EQ, sPlant)] : [];

			var that = this;
			console.log("[IRGP] Loading departments for Plant:", sPlant);
			oODataModel.read("/zdepartmentSet", {
				filters: aFilters,
				success: function (oData) {
					var aNormalized = (oData.results || []).map(function (d) {
						var sKey = d.Kostl || d.Department || d.Dept || d.Id || d.Code || d.Zdept || "";
						var sText = d.Ktext || d.Description || d.Name || d.Text || d.DepartmentText || d.ZdeptName || sKey;
						if (sKey === "") {
							var keys = Object.keys(d).filter(function(k) { return k !== "__metadata"; });
							if (keys.length > 0) sKey = d[keys[0]];
							if (keys.length > 1) sText = d[keys[1]] || sKey;
						}
						return {
							key: sKey,
							text: sText ? (sKey !== sText ? sKey + " - " + sText : sText) : sKey
						};
					});
					
					aNormalized.sort(function(a, b) {
						return a.text.localeCompare(b.text);
					});

					var oModel = that.getView().getModel("irgp");
					if (oModel) {
						oModel.setProperty("/dropdowns/departments", aNormalized);
					}
				},
				error: function (oError) {
					console.error("Failed to load departments from /zdepartmentSet", oError);
				}
			});
		},

		_loadUsersForDepartment: function (sDepartment) {
			if (!sDepartment) { return; }
			var oModel = this.getView().getModel("irgp");
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			oODataModel.read("/zdepartuserSet", {
				filters: [new sap.ui.model.Filter("department", sap.ui.model.FilterOperator.EQ, sDepartment)],
				success: function (oData) {
					var aUsers = (oData.results || []).map(function (u) {
						var sId = u.userid || u.Userid || u.UserId || u.Bname || "";
						var sName = u.username || u.Username || u.NameText || u.Name || sId;
						return {
							key: sId,
							text: sId && sName && sId !== sName ? sId + " - " + sName : sName
						};
					});
					if (oModel) {
						oModel.setProperty("/dropdowns/users", aUsers);
					}
				},
				error: function () {
					if (oModel) {
						oModel.setProperty("/dropdowns/users", []);
					}
				}
			});
		},

		onDepartmentChange: function (oEvent) {
			var oComboBox = oEvent.getSource();
			var sDepartment = oComboBox.getSelectedKey() || oComboBox.getValue();
			var oModel = this.getView().getModel("irgp");
			
			console.log("Department changed to:", sDepartment);

			if (!sDepartment) {
				if (oModel) { oModel.setProperty("/dropdowns/users", []); }
				return;
			}

			this._loadUsersForDepartment(sDepartment);
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
			if (sClean === "MT" || sClean === "TON" || sClean === "TONS" || sClean === "METRIC TONS" || sClean === "TO") {
				return "Metric Tons";
			}
			if (sClean === "FT" || sClean === "FEET") {
				return "Feet";
			}
			if (sClean === "L" || sClean === "LTR" || sClean === "LITRE" || sClean === "LITRES") {
				return "Litre";
			}
			if (sClean === "M3" || sClean === "CBM" || sClean === "CUBIC METER") {
				return "Cubic Meter";
			}
			if (sClean === "FT3" || sClean === "CFT" || sClean === "CUBIC FEET") {
				return "Cubic Feet";
			}
			if (sClean === "M2" || sClean === "SQM" || sClean === "SQUARE METER") {
				return "Square Meter";
			}
			if (sClean === "FT2" || sClean === "SQFT" || sClean === "SQUARE FEET") {
				return "Square Feet";
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
			if (sClean === "CAN" || sClean === "CANS") {
				return "Can";
			}
			if (sClean === "CAR" || sClean === "CARTON") {
				return "Carton";
			}
			if (sClean === "DR" || sClean === "DRUM") {
				return "Drum";
			}
			if (sClean === "PR" || sClean === "PAIR") {
				return "Pair";
			}
			if (sClean === "UNT" || sClean === "UNIT") {
				return "Unit";
			}
			return sUom.charAt(0).toUpperCase() + sUom.slice(1).toLowerCase();
		},

		_toSAPUOM: function (sUom) {
			if (!sUom) return "";
			var sClean = String(sUom).trim().toUpperCase();
			var mMap = {
				"CUBIC METER": "M3",
				"CBM":         "M3",
				"M3":          "M3",
				"CUBIC FEET":  "FT3",
				"CFT":         "FT3",
				"FT3":         "FT3",
				"SQUARE METER":"M2",
				"SQM":         "M2",
				"M2":          "M2",
				"SQUARE FEET": "FT2",
				"SQFT":        "FT2",
				"FT2":         "FT2",
				"KILOGRAM":    "KG",
				"KGS":         "KG",
				"KG":          "KG",
				"METERS":      "M",
				"METER":       "M",
				"MTR":         "M",
				"M":           "M",
				"METRIC TONS": "TO",
				"TONS":        "TO",
				"TON":         "TO",
				"MT":          "TO",
				"TO":          "TO",
				"NUMBER":      "NO",
				"NUMBERS":     "NO",
				"NUM":         "NO",
				"NOS":         "NO",
				"NO":          "NO",
				"EA":          "EA",
				"PC":          "PC",
				"ST":          "ST",
				"LITRE":       "L",
				"LITRES":      "L",
				"LTR":         "L",
				"L":           "L",
				"FEET":        "FT",
				"FOOT":        "FT",
				"FT":          "FT",
				"ROLL":        "ROL",
				"ROLLS":       "ROL",
				"ROL":         "ROL",
				"BARREL":      "BBL",
				"BARRELS":     "BBL",
				"BBL":         "BBL",
				"BOTTLE":      "BOT",
				"BOTTLES":     "BOT",
				"BOT":         "BOT",
				"BUNDLE":      "BDL",
				"BUNDLES":     "BDL",
				"BDL":         "BDL",
				"CAN":         "CAN",
				"CANS":        "CAN",
				"CARTON":      "CAR",
				"CARTONS":     "CAR",
				"CAR":         "CAR",
				"CARTRIDGE":   "CTG",
				"CARTRIDGES":  "CTG",
				"CTG":         "CTG",
				"COIL":        "COI",
				"COILS":       "COI",
				"COI":         "COI",
				"CYLINDER":    "CYL",
				"CYLINDERS":   "CYL",
				"CYL":         "CYL",
				"DRUM":        "DR",
				"DRUMS":       "DR",
				"DR":          "DR",
				"LENGTH":      "LEN",
				"LENGTHS":     "LEN",
				"LEN":         "LEN",
				"LOAD":        "LOD",
				"LOADS":       "LOD",
				"LOD":         "LOD",
				"LOT":         "LOT",
				"LOTS":        "LOT",
				"MONTH":       "MON",
				"MONTHS":      "MON",
				"MON":         "MON",
				"PAIR":        "PR",
				"PAIRS":       "PR",
				"PR":          "PR",
				"SHEET":       "SHT",
				"SHEETS":      "SHT",
				"SHT":         "SHT",
				"ITEM":        "ITM",
				"ITEMS":       "ITM",
				"ITM":         "ITM",
				"PACK":        "PAC",
				"PACKS":       "PAC",
				"PAC":         "PAC",
				"DAYS":        "DAY",
				"DAY":         "DAY",
				"POCKET":      "PKT",
				"POCKETS":     "PKT",
				"PKT":         "PKT",
				"REAM":        "REM",
				"REAMS":       "REM",
				"REM":         "REM",
				"UNIT":        "UNT",
				"UNITS":       "UNT",
				"UNT":         "UNT",
				"AMPS":        "AMP",
				"AMP":         "AMP",
				"BOX":         "BOX",
				"BOXES":       "BOX",
				"BAG":         "BAG",
				"BAGS":        "BAG",
				"SET":         "SET",
				"SETS":        "SET"
			};
			if (mMap[sClean]) {
				return mMap[sClean];
			}
			if (sClean.length <= 3) {
				return sClean;
			}
			return sClean.substring(0, 3);
		},

		onSort: function () {
			this._openSortDialog("idIRGPListTable", [
				{ key: "GEDate", text: "IRGP Date", selected: true },
				{ key: "IRGPNo", text: "IRGP No" },
				{ key: "RequestType", text: "IRGP Type" },
				{ key: "DueDate", text: "Due Date" },
				{ key: "ReturnedDate", text: "Ret Date" },
				{ key: "RequestUser", text: "Req User" },
				{ key: "Department", text: "Req Dept" },
				{ key: "ContractName", text: "Contract Name" },
				{ key: "ContractEmployeeName", text: "Contract Employee Name" },
				{ key: "StatusDisplay", text: "Status" }
			]);
		}

	});
});

