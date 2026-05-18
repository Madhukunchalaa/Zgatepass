sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return Controller.extend("zgpms.meilpower.com.controller.IRGP", {

		// =========================================================================
		// Lifecycle & Router Handlers
		// =========================================================================

		onInit: function () {
			this._getRouter().getRoute("IRGP").attachPatternMatched(this._onRouteMatched, this);
			this._resetFormModel();
		},

		_onRouteMatched: function (oEvent) {
			var oArgs = oEvent.getParameter("arguments");
			var sStep = oArgs.step ? oArgs.step.toUpperCase() : "CREATE";
			var sGPNo = oArgs.gpNo || "";

			// Load corresponding state dataset or initialize fresh form
			if (sStep === "LIST") {
				this._applyListMode();
			} else if (sStep === "CREATE") {
				this._resetFormModel();
				this._applyCreateMode();
			} else {
				this._loadMockDocument(sStep, sGPNo);
			}
		},

		// =========================================================================
		// Mode Application States (Clean MVVM Boolean Mappings)
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
			oModel.setProperty("/ui/currentStep", "CREATE");
			oModel.setProperty("/ui/title", "Create Internal Returnable Gate Pass (IRGP)");
			oModel.setProperty("/ui/bannerText", "Current Step: Materials Issue in Progress (No Reservation Required)");
			oModel.setProperty("/ui/bannerType", "Information");

			// Boolean fields & columns control flags
			oModel.setProperty("/ui/headerEditable", true);
			oModel.setProperty("/ui/itemsEditable", true);
			oModel.setProperty("/ui/mrNumberEditable", false);
			oModel.setProperty("/ui/receivedQtyEditable", false);

			// Action footer visibility flags
			oModel.setProperty("/ui/submitVisible", true);
			oModel.setProperty("/ui/submitResVisible", false);
			oModel.setProperty("/ui/closeVisible", false);
			oModel.setProperty("/ui/printVisible", false);
		},

		_applyUserUpdateMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep", "USER_UPDATE");
			oModel.setProperty("/ui/title", "Update Reservation Details — Department Workflow");
			oModel.setProperty("/ui/bannerText", "Current Step: Waiting for Department to Allocate & Link Reservation / MR Number");
			oModel.setProperty("/ui/bannerType", "Warning");

			oModel.setProperty("/ui/headerEditable", false);
			oModel.setProperty("/ui/itemsEditable", false);
			oModel.setProperty("/ui/mrNumberEditable", true);
			oModel.setProperty("/ui/receivedQtyEditable", false);

			oModel.setProperty("/ui/submitVisible", false);
			oModel.setProperty("/ui/submitResVisible", true);
			oModel.setProperty("/ui/closeVisible", false);
			oModel.setProperty("/ui/printVisible", true);
		},

		_applyStoreCloseMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep", "STORE_CLOSE");
			oModel.setProperty("/ui/title", "Verify Materials Receipt & Close IRGP");
			oModel.setProperty("/ui/bannerText", "Current Step: Physical Materials Returned. Waiting for Stores Verification & Final Gate Closure");
			oModel.setProperty("/ui/bannerType", "Warning");

			oModel.setProperty("/ui/headerEditable", false);
			oModel.setProperty("/ui/itemsEditable", false);
			oModel.setProperty("/ui/mrNumberEditable", false);
			oModel.setProperty("/ui/receivedQtyEditable", true);

			oModel.setProperty("/ui/submitVisible", false);
			oModel.setProperty("/ui/submitResVisible", false);
			oModel.setProperty("/ui/closeVisible", true);
			oModel.setProperty("/ui/printVisible", true);
		},

		_applyClosedMode: function () {
			var oModel = this.getView().getModel("irgp");
			oModel.setProperty("/ui/currentStep", "CLOSED");
			oModel.setProperty("/ui/title", "IRGP Document Details (Archived)");
			oModel.setProperty("/ui/bannerText", "Status: IRGP Closed Successfully — All Materials Accounted, Verified and Linked");
			oModel.setProperty("/ui/bannerType", "Success");

			oModel.setProperty("/ui/headerEditable", false);
			oModel.setProperty("/ui/itemsEditable", false);
			oModel.setProperty("/ui/mrNumberEditable", false);
			oModel.setProperty("/ui/receivedQtyEditable", false);

			oModel.setProperty("/ui/submitVisible", false);
			oModel.setProperty("/ui/submitResVisible", false);
			oModel.setProperty("/ui/closeVisible", false);
			oModel.setProperty("/ui/printVisible", true);
		},

		// =========================================================================
		// List View & Central Dashboard Actions
		// =========================================================================

		onPressCreateNewIRGP: function () {
			this._getRouter().navTo("IRGP", {
				step: "CREATE",
				gpNo: "NEW"
			});
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
			this._getRouter().navTo("IRGP", {
				step: "USER_UPDATE",
				gpNo: oItem.IRGPNo
			});
		},

		onActionVerifyReturn: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("irgpGlobal").getObject();
			this._getRouter().navTo("IRGP", {
				step: "STORE_CLOSE",
				gpNo: oItem.IRGPNo
			});
		},

		onActionViewClosed: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("irgpGlobal").getObject();
			this._getRouter().navTo("IRGP", {
				step: "CLOSED",
				gpNo: oItem.IRGPNo
			});
		},

		// =========================================================================
		// Items Grid Calculations & Management
		// =========================================================================

		onSentQtyChange: function (oEvent) {
			var oInput = oEvent.getSource();
			var sPath = oInput.getBindingContext("irgp").getPath();
			var oModel = this.getView().getModel("irgp");

			var fSent = parseFloat(oInput.getValue()) || 0;
			var fRec  = parseFloat(oModel.getProperty(sPath + "/RecievedQuantity")) || 0;

			// Format value on model
			oModel.setProperty(sPath + "/SentQuantity", String(fSent));
			this._recalculateBalance(sPath, fSent, fRec);
		},

		onRecQtyChange: function (oEvent) {
			var oInput = oEvent.getSource();
			var sPath = oInput.getBindingContext("irgp").getPath();
			var oModel = this.getView().getModel("irgp");

			var fSent = parseFloat(oModel.getProperty(sPath + "/SentQuantity")) || 0;
			var fRec  = parseFloat(oInput.getValue()) || 0;

			if (fRec > fSent) {
				MessageBox.error("Received Quantity cannot exceed Sent Quantity (" + fSent + ").");
				oInput.setValue("0");
				fRec = 0;
			}

			this._recalculateBalance(sPath, fSent, fRec);
		},

		_recalculateBalance: function (sPath, fSent, fRec) {
			var oModel = this.getView().getModel("irgp");
			var fBal = fSent - fRec;
			if (fBal < 0) { fBal = 0; }
			oModel.setProperty(sPath + "/BalanceQuantity", String(fBal));
			oModel.setProperty("/ui/hasPendingChanges", true);
		},

		onAddItem: function () {
			var oModel = this.getView().getModel("irgp");
			var aItems = oModel.getProperty("/items") || [];
			var iNewSNo = aItems.length + 1;

			aItems.push({
				SNo: iNewSNo,
				ItemCode: "",
				ItemDescription: "",
				SentQuantity: "0",
				RecievedQuantity: "0",
				BalanceQuantity: "0",
				UOM: "",
				MRNumber: "",
				Location: "",
				Mp2ItemCode: "",
				DefaultBin: ""
			});

			oModel.setProperty("/items", aItems);
			oModel.setProperty("/ui/hasPendingChanges", true);
			MessageToast.show("Asset row added.");
		},

		onDeleteItem: function (oEvent) {
			var oButton = oEvent.getSource();
			var oCtx = oButton.getBindingContext("irgp");
			var oModel = this.getView().getModel("irgp");
			var aItems = oModel.getProperty("/items");

			if (oCtx && aItems) {
				var sPath = oCtx.getPath();
				var iIdx = parseInt(sPath.substring(sPath.lastIndexOf("/") + 1), 10);
				
				aItems.splice(iIdx, 1);
				
				// Re-index Serial Numbers
				aItems.forEach(function (oItem, i) {
					oItem.SNo = i + 1;
				});

				oModel.setProperty("/items", aItems);
				oModel.setProperty("/ui/hasPendingChanges", true);
				MessageToast.show("Row removed.");
			}
		},

		// =========================================================================
		// Business Action Simulations & Model Persistence
		// =========================================================================

		onSubmit: function () {
			var oModel = this.getView().getModel("irgp");
			var oHeader = oModel.getProperty("/header");
			var aItems = oModel.getProperty("/items");

			// Validations
			if (!oHeader.Department) { MessageBox.error("Please enter Department."); return; }
			if (!oHeader.ContractName) { MessageBox.error("Please enter Contract Vendor Name."); return; }
			if (!oHeader.ContractEmployeeName) { MessageBox.error("Please enter Responsible Person Name."); return; }
			if (!oHeader.DueDate) { MessageBox.error("Please enter Expected Due Date."); return; }
			if (!aItems || aItems.length === 0) { MessageBox.error("Please add at least one material item."); return; }

			var sIrgpNo = "IRGP2026-27-0" + Math.floor(Math.random() * 9000 + 1000);

			// Build persistent record for global model:
			var oNewDoc = {
				IRGPNo: sIrgpNo,
				GEDate: oHeader.GEDate,
				DueDate: oHeader.DueDate,
				RevisedDueDate: oHeader.DueDate,
				ReturnedDate: "01-01-1900",
				Department: oHeader.Department,
				RequestUser: oHeader.RequestUser,
				ReturnUser: "",
				ContractName: oHeader.ContractName,
				ContractEmployeeName: oHeader.ContractEmployeeName,
				RequestType: oHeader.RequestType,
				Remarks: oHeader.Remarks,
				StatusCode: "PENDING_RESERVATION", // User needs to enter MRN number
				items: aItems.map(function (item) {
					return {
						SNo: item.SNo,
						ItemCode: item.ItemCode,
						ItemDescription: item.ItemDescription,
						SentQuantity: item.SentQuantity || "1",
						RecievedQuantity: "0",
						BalanceQuantity: item.SentQuantity || "1",
						UOM: item.UOM,
						MRNumber: "",
						Location: item.Location,
						Mp2ItemCode: item.Mp2ItemCode,
						DefaultBin: item.DefaultBin
					};
				}),
				timeline: [
					{
						title: "Document Created by Stores",
						description: "Emergency asset dispatch completed. Waiting for department reservation linking.",
						user: "IE-Admin (Stores)",
						date: new Date().toLocaleString(),
						icon: "sap-icon://create"
					}
				]
			};

			var oGlobalModel = this.getOwnerComponent().getModel("irgpGlobal");
			if (oGlobalModel) {
				var aDocs = oGlobalModel.getProperty("/documents") || [];
				aDocs.unshift(oNewDoc); // Add new pass at the top!
				oGlobalModel.setProperty("/documents", aDocs);
			}

			MessageBox.success("Internal Returnable Gate Pass " + sIrgpNo + " has been successfully created!\nStatus set to: PENDING_RESERVATION (Ready for Department User).", {
				onClose: function () {
					oModel.setProperty("/ui/hasPendingChanges", false);
					// Route back to the central LIST
					this._getRouter().navTo("IRGP", {
						step: "LIST",
						gpNo: "ALL"
					});
				}.bind(this)
			});
		},

		onSubmitReservation: function () {
			var oModel = this.getView().getModel("irgp");
			var oHeader = oModel.getProperty("/header");
			var aItems = oModel.getProperty("/items");

			// Check that all rows have an MR Number allocated
			var bMissingMr = aItems.some(function (item) {
				return !item.MRNumber || item.MRNumber.trim() === "";
			});

			if (bMissingMr) {
				MessageBox.error("Please enter MR/Reservation Number for all listed items before submitting.");
				return;
			}

			// Update persistent global record
			var oGlobalModel = this.getOwnerComponent().getModel("irgpGlobal");
			if (oGlobalModel) {
				var aDocs = oGlobalModel.getProperty("/documents") || [];
				var oDoc = aDocs.find(function (d) { return d.IRGPNo === oHeader.IRGPNo; });
				if (oDoc) {
					oDoc.StatusCode = "PENDING_RECEIPT"; // Updates state to stores return verification!
					oDoc.items = aItems; // Saves the entered MRNumbers
					if (!oDoc.timeline) { oDoc.timeline = []; }
					oDoc.timeline.push({
						title: "Reservation MR Linked by User",
						description: "Material reservation MR Number uploaded and validated by requesting supervisor.",
						user: oHeader.RequestUser || "User Department",
						date: new Date().toLocaleString(),
						icon: "sap-icon://edit"
					});
					oGlobalModel.setProperty("/documents", aDocs);
				}
			}

			MessageBox.success("Reservation details linked successfully!\nStatus set to: PENDING_RECEIPT (Ready for Stores Return Receipt).", {
				onClose: function () {
					oModel.setProperty("/ui/hasPendingChanges", false);
					this._getRouter().navTo("IRGP", {
						step: "LIST",
						gpNo: "ALL"
					});
				}.bind(this)
			});
		},

		onCloseIRGP: function () {
			var oModel = this.getView().getModel("irgp");
			var oHeader = oModel.getProperty("/header");
			var aItems = oModel.getProperty("/items");

			// Verify counts
			var bMissingRec = aItems.some(function (item) {
				return !item.RecievedQuantity || parseInt(item.RecievedQuantity, 10) < 0;
			});

			if (bMissingRec) {
				MessageBox.error("Please verify received counts for all rows.");
				return;
			}

			// Check if there is an active outstanding balance
			var bOutstandingBalance = aItems.some(function (item) {
				return parseInt(item.BalanceQuantity, 10) > 0;
			});

			var sConfirmationText = bOutstandingBalance ? 
				"There is still an outstanding balance on some items. Are you sure you want to partially close this IRGP?" :
				"All materials have been accounted for. Confirm Gate Pass closure?";

			MessageBox.confirm(sConfirmationText, {
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						// Update persistent global record
						var oGlobalModel = this.getOwnerComponent().getModel("irgpGlobal");
						if (oGlobalModel) {
							var aDocs = oGlobalModel.getProperty("/documents") || [];
							var oDoc = aDocs.find(function (d) { return d.IRGPNo === oHeader.IRGPNo; });
							if (oDoc) {
								oDoc.StatusCode = "CLOSED";
								oDoc.ReturnedDate = new Date().toISOString().split("T")[0];
								oDoc.items = aItems;
								oDoc.ReturnUser = "IE-Admin (Stores)";
								if (!oDoc.timeline) { oDoc.timeline = []; }
								oDoc.timeline.push({
									title: "Audit & Close out by Stores",
									description: "Physical counts verified. Transaction complete and archived.",
									user: "IE-Admin (Stores)",
									date: new Date().toLocaleString(),
									icon: "sap-icon://accept"
								});
								oGlobalModel.setProperty("/documents", aDocs);
							}
						}

						MessageBox.success("IRGP Document has been successfully CLOSED and archived.", {
							onClose: function () {
								oModel.setProperty("/ui/hasPendingChanges", false);
								this._getRouter().navTo("IRGP", {
									step: "LIST",
									gpNo: "ALL"
								});
							}.bind(this)
						});
					}
				}.bind(this)
			});
		},

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
		// Mock Data Handlers & Internal Utilities
		// =========================================================================

		_resetFormModel: function () {
			var oData = {
				header: {
					IRGPNo: "Draft (Auto-Generated)",
					GEDate: "06-05-2026",
					DueDate: "13-05-2026",
					RevisedDueDate: "",
					ReturnedDate: "",
					Department: "ELECTRICAL",
					RequestUser: "Muthuraman A",
					ReturnUser: "",
					ContractName: "POWER MECH PROJECTS LTD - Pressure parts",
					ContractEmployeeName: "SURESH",
					RequestType: "HxGN EAM",
					Remarks: "",
					StatusCode: "CREATE"
				},
				items: [
					{
						SNo: 1,
						ItemCode: "6055850018",
						ItemDescription: "Online AAQMS(Ambient Air Quality Monitoring S:",
						SentQuantity: "",
						RecievedQuantity: "0",
						BalanceQuantity: "0",
						UOM: "Set",
						MRNumber: "",
						Location: "NP1",
						Mp2ItemCode: "",
						DefaultBin: "-"
					}
				],
				dropdowns: {
					departments: [
						{ key: "ELECTRICAL", text: "ELECTRICAL" },
						{ key: "MECHANICAL", text: "MECHANICAL" },
						{ key: "INSTRUMENTATION", text: "INSTRUMENTATION" },
						{ key: "STORES", text: "STORES" }
					],
					users: [
						{ key: "Muthuraman A", text: "Muthuraman A" },
						{ key: "Sathish Panchatsaram", text: "Sathish Panchatsaram" },
						{ key: "S. Rao", text: "S. Rao" }
					],
					contracts: [
						{ key: "POWER MECH PROJECTS LTD - Pressure parts", text: "POWER MECH PROJECTS LTD - Pressure parts" },
						{ key: "POWER MECH PROJECTS LTD - LHP & AHP", text: "POWER MECH PROJECTS LTD - LHP & AHP" },
						{ key: "TAQA GE Corp", text: "TAQA GE Corp" }
					],
					items: [
						{ key: "6055850018", text: "6055850018" },
						{ key: "7843200012", text: "7843200012" },
						{ key: "TOOL-504", text: "TOOL-504" },
						{ key: "TOOL-122", text: "TOOL-122" }
					],
					uoms: [
						{ key: "Set", text: "Set" },
						{ key: "Kilograms", text: "Kilograms" },
						{ key: "EA", text: "EA" }
					]
				},
				timeline: [
					{
						title: "Created by Stores",
						description: "Emergency Issue of Tools/Assets. Waiting for department reservation linking.",
						user: "IE-Admin (Stores Department)",
						date: new Date().toLocaleString(),
						icon: "sap-icon://create"
					}
				],
				workflow: {
					taskId: "TS30000123",
					workItemId: "000010954231",
					approver: "STORES_MGR"
				},
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
					submitVisible: true,
					submitResVisible: false,
					closeVisible: false,
					printVisible: false
				}
			};

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "irgp");
		},

		_loadMockDocument: function (sStep, sGPNo) {
			var sDocNo = sGPNo || "IRGP2026-27-0068";
			var oGlobalModel = this.getOwnerComponent().getModel("irgpGlobal");
			var aDocs = oGlobalModel ? oGlobalModel.getProperty("/documents") : [];
			var oFoundDoc = aDocs.find(function (doc) {
				return doc.IRGPNo === sDocNo;
			});

			var oData;
			if (oFoundDoc) {
				// Deep clone the persistent record so edits don't auto-save prematurely
				oData = JSON.parse(JSON.stringify(oFoundDoc));
				oData.dropdowns = this._getDefaultDropdowns();
				oData.ui = {
					currentStep: sStep,
					title: "IRGP Details",
					hasPendingChanges: false,
					bannerText: "",
					bannerType: "Information",
					headerEditable: false,
					itemsEditable: false,
					mrNumberEditable: sStep === "USER_UPDATE",
					receivedQtyEditable: sStep === "STORE_CLOSE",
					submitVisible: false,
					submitResVisible: sStep === "USER_UPDATE",
					closeVisible: sStep === "STORE_CLOSE",
					printVisible: true
				};
			} else {
				// Fallback to static mock generator
				oData = this._getFallbackMockData(sStep, sDocNo);
			}

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "irgp");

			// Trigger visual configurations:
			if (sStep === "USER_UPDATE") {
				this._applyUserUpdateMode();
			} else if (sStep === "STORE_CLOSE") {
				this._applyStoreCloseMode();
			} else if (sStep === "CLOSED") {
				this._applyClosedMode();
			}
		},

		_getDefaultDropdowns: function () {
			return {
				departments: [
					{ key: "ELECTRICAL", text: "ELECTRICAL" },
					{ key: "MECHANICAL", text: "MECHANICAL" },
					{ key: "INSTRUMENTATION", text: "INSTRUMENTATION" },
					{ key: "STORES", text: "STORES" }
				],
				users: [
					{ key: "Muthuraman A", text: "Muthuraman A" },
					{ key: "Sathish Panchatsaram", text: "Sathish Panchatsaram" },
					{ key: "S. Rao", text: "S. Rao" }
				],
				contracts: [
					{ key: "POWER MECH PROJECTS LTD - Pressure parts", text: "POWER MECH PROJECTS LTD - Pressure parts" },
					{ key: "POWER MECH PROJECTS LTD - LHP & AHP", text: "POWER MECH PROJECTS LTD - LHP & AHP" },
					{ key: "TAQA GE Corp", text: "TAQA GE Corp" }
				],
				items: [
					{ key: "6055850018", text: "6055850018" },
					{ key: "7843200012", text: "7843200012" },
					{ key: "TOOL-504", text: "TOOL-504" },
					{ key: "TOOL-122", text: "TOOL-122" }
				],
				uoms: [
					{ key: "Set", text: "Set" },
					{ key: "Kilograms", text: "Kilograms" },
					{ key: "EA", text: "EA" }
				]
			};
		},

		_getFallbackMockData: function (sStep, sGPNo) {
			var oData = {
				header: {
					IRGPNo: sGPNo,
					GEDate: "06-05-2026",
					DueDate: "13-05-2026",
					RevisedDueDate: "13-05-2026",
					ReturnedDate: "01-01-1900",
					Department: "MECHANICAL",
					RequestUser: "Sathish Panchatsaram",
					ReturnUser: "",
					MRNumber: "",
					ContractName: "POWER MECH PROJECTS LTD - LHP & AHP",
					ContractEmployeeName: "Sureshbabu",
					RequestType: "HxGN EAM",
					Remarks: "Material issue for Slag path work",
					StatusCode: "PENDING_RESERVATION"
				},
				items: [
					{
						SNo: 1,
						ItemCode: "7843200012",
						ItemDescription: "Alloy Steel Plate, Grade: 16MO3, ASTM",
						SentQuantity: "314",
						RecievedQuantity: "0",
						BalanceQuantity: "314",
						UOM: "Kilograms",
						MRNumber: "",
						Location: "NP1",
						Mp2ItemCode: "",
						DefaultBin: "PS - 08"
					}
				],
				dropdowns: this._getDefaultDropdowns(),
				timeline: [
					{
						title: "Document Created by Stores",
						description: "Emergency asset dispatch completed without pre-requisite reservation logs.",
						user: "IE-Admin (Stores)",
						date: "2026-05-06 09:12 AM",
						icon: "sap-icon://create"
					}
				],
				workflow: {
					taskId: "TS30000123",
					workItemId: "000010954231",
					approver: "STORES_MGR"
				},
				ui: {
					currentStep: sStep,
					title: "IRGP Details",
					hasPendingChanges: false,
					bannerText: "",
					bannerType: "Information",
					headerEditable: false,
					itemsEditable: false,
					mrNumberEditable: sStep === "USER_UPDATE",
					receivedQtyEditable: sStep === "STORE_CLOSE",
					submitVisible: false,
					submitResVisible: sStep === "USER_UPDATE",
					closeVisible: sStep === "STORE_CLOSE",
					printVisible: true
				}
			};

			if (sStep === "STORE_CLOSE" || sStep === "CLOSED") {
				oData.items[0].MRNumber = "MR-99421";
				if (!oData.timeline) { oData.timeline = []; }
				oData.timeline.push({
					title: "Reservation MR Linked by User",
					description: "Material reservation MR-99421 uploaded and validated by requesting supervisor.",
					user: "Sathish Panchatsaram",
					date: "2026-05-07 10:45 AM",
					icon: "sap-icon://edit"
				});
			}

			if (sStep === "CLOSED") {
				oData.header.ReturnedDate = "2026-05-08";
				oData.items[0].RecievedQuantity = "314";
				oData.items[0].BalanceQuantity = "0";
				if (!oData.timeline) { oData.timeline = []; }
				oData.timeline.push({
					title: "Audit & Close out by Stores",
					description: "Physical counts verified. Transaction complete and archived.",
					user: "IE-Admin (Stores)",
					date: "2026-05-08 11:30 AM",
					icon: "sap-icon://accept"
				});
			}

			return oData;
		},

		_getRouter: function () {
			return sap.ui.core.UIComponent.getRouterFor(this);
		},

		getRouter: function () {
			return this._getRouter();
		},

		onNavHome: function () {
			var oModel = this.getView().getModel("irgp");
			if (oModel && oModel.getProperty("/ui/hasPendingChanges")) {
				MessageBox.confirm("You have unsaved changes. Are you sure you want to leave?", {
					onClose: function (oAction) {
						if (oAction === MessageBox.Action.OK) {
							oModel.setProperty("/ui/hasPendingChanges", false);
							this.getRouter().navTo("IRGP", {
								step: "LIST",
								gpNo: "ALL"
							});
						}
					}.bind(this)
				});
			} else {
				this.getRouter().navTo("IRGP", {
					step: "LIST",
					gpNo: "ALL"
				});
			}
		}

	});
});
