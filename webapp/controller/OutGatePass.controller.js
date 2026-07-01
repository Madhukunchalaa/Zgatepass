sap.ui.define([
	"zgpms/meilpower/com/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.OutGatePass", {

		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("OutGatePass").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			var oArgs = oEvent.getParameter("arguments");
			var sReqNo = oArgs.reqNo;
			var sGPNo  = (oArgs.gpNo && oArgs.gpNo !== "-") ? oArgs.gpNo : "";
			var oUserModel = sap.ui.getCore().getModel("user");
			var bGatepassUserOnly = oUserModel ? oUserModel.getProperty("/IsGatepassUserOnly") : false;
			// Allow GatepassUserOnly role through only when coming from the list with a reqNo (Amendment edit)
			if (bGatepassUserOnly && !sReqNo) {
				MessageBox.error("You do not have authorization to access the Out Gate Pass screen.");
				this.getRouter().navTo("home");
				return;
			}
			if (sReqNo) {
				this._loadByReqNo(sReqNo, sGPNo);
			}
		},

		_loadByReqNo: function (sReqNo, sGPNo) {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				return;
			}

			this.byId("requestSearch").setValue(sReqNo);
			sap.ui.core.BusyIndicator.show(0);

			oODataModel.read("/GateReqHdrSet", {
				filters: [new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo)],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oResult = oData.results && oData.results[0];
					if (!oResult) {
						sap.m.MessageBox.error("No data found for Request No: " + sReqNo);
						return;
					}
					var sStatus = this._getNormalizedStatus(oResult);
					if (sStatus === "APPROVED" || sStatus === "CLOSED" || sStatus === "CANCELLED") {
						this._validateAndMapData(oResult);
						if (sStatus === "CLOSED") {
							var oOutModel = this.getView().getModel("out");
							oOutModel.setProperty("/ApprovalStatus", "CLOSED");
							oOutModel.setProperty("/ApprovalState", "Success");
							oOutModel.setProperty("/ApprovalIcon", "sap-icon://sys-enter-2");
						} else if (sStatus === "CANCELLED") {
							var oOutModel = this.getView().getModel("out");
							oOutModel.setProperty("/ApprovalStatus", "CANCELLED");
							oOutModel.setProperty("/ApprovalState", "Error");
							oOutModel.setProperty("/ApprovalIcon", "sap-icon://sys-cancel-2");
						}
						// If a GP No was passed directly (navigated from Gate Pass List),
						// force-set it and open logistics immediately
						if (sGPNo) {
							var oOutModel = this.getView().getModel("out");
							oOutModel.setProperty("/GatePassNo", sGPNo);
							oOutModel.setProperty("/showLogistics", true);
						}
					} else if (sStatus === "AMENDMENT") {
						this._validateAndMapData(oResult);
					} else if (sStatus === "REJECTED") {
						sap.m.MessageBox.error("Request Number " + sReqNo + " has been Rejected.");
						this._validateAndMapData(oResult);
						var oOutModel = this.getView().getModel("out");
						oOutModel.setProperty("/ApprovalStatus", "REJECTED");
						oOutModel.setProperty("/ApprovalState", "Error");
						oOutModel.setProperty("/ApprovalIcon", "sap-icon://decline");
					} else {
						this._showApprovalFlow(oResult);
					}
				}.bind(this),
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					sap.m.MessageBox.error("Error fetching request " + sReqNo);
				}
			});
		},

		onAddComment: function () {
			var oOutModel = this.getView().getModel("out");
			var aComments = oOutModel.getProperty("/CommentsList") || [];
			var sDate = new Date().toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric"
			}).split("/").join("-");

			aComments.push({
				text: "",
				date: sDate
			});
			oOutModel.setProperty("/CommentsList", aComments);
			oOutModel.refresh(true);
		},

		onDeleteComment: function (oEvent) {
			var oItem = oEvent.getSource().getParent();
			var oTable = oItem.getParent();
			var iIndex = oTable.indexOfItem(oItem);

			var oOutModel = this.getView().getModel("out");
			var aComments = oOutModel.getProperty("/CommentsList");
			aComments.splice(iIndex, 1);
			oOutModel.setProperty("/CommentsList", aComments);
			oOutModel.refresh(true);
		},
		onQuantityChange: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("out").getObject();
			var oOutModel = this.getView().getModel("out");

			var fSent = parseFloat(oItem.sentQty || 0);
			var fRecvd = parseFloat(oItem.recvdQty || 0);
			var fRate = parseFloat(oItem.rate || 0);

			// Update Balance with precision rounding
			oItem.balQty = parseFloat((fSent - fRecvd).toFixed(3));

			// Update Amount with precision rounding
			oItem.amount = parseFloat((fSent * fRate).toFixed(3));

			oOutModel.refresh(true);
			this._calculateFinalTotal();
		},

		_calculateFinalTotal: function () {
			var oOutModel = this.getView().getModel("out");
			var aItems = oOutModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (sum, item) {
				return sum + parseFloat(item.amount || 0);
			}, 0);
			oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}));
		},

		_resetModel: function () {
			var oData = {
				GatePassreqNo: "",
				GatePassNo: "",
				GatePassType: "",
				GatePassDate: "",
				Requestor: "",
				Department: "",
				VendorName: "",
				VendorGST: "",
				VendorAddress: "",
				UserRemarks: "",
				HODRemarks: "",
				StoreRemarks: "",
				items: [],
				FinalTotal: "0.00",
				showLogistics: false,
				showApprovalFlow: false,
				HODApproved: false,
				StoreApproved: false,
				StoreActive: false,
				DocOptionIndex: 0,
				Status: "OPEN",
				CommentsList: [],
				TransporterName: "",
				TransporterGST: "",
				DCNotes: "",
				InsuranceRequired: false,
				LRNnumber: "",
				VehicleNo: "",
				ModeOfTransport: "Road",
				TransportByIndex: 1,
				NoOfPackages: 0,
				ChallanNumber: "",
				ChallanDate: null,
				CommonDesc: "",
				Plant: "",
				ExtendedReturnableDate: null,
				Cocode: ""
			};
			var oModel = this.getView().getModel("out");
			if (oModel) {
				oModel.setData(oData);
			} else {
				this.getView().setModel(new JSONModel(oData), "out");
			}
		},

		onSearchRequest: function (oEvent) {
			var sReqNo = "";
			if (oEvent.getParameter("selectedItem")) {
				sReqNo = oEvent.getParameter("selectedItem").getKey();
			} else if (oEvent.getParameter("query")) {
				sReqNo = oEvent.getParameter("query");
			} else {
				return;
			}

			if (!sReqNo) {
				MessageBox.error("Request number not found");
				return;
				
			}

			var oODataModel = this.getOwnerComponent().getModel();
			this._resetModel(); // Clear existing
			if (!oODataModel) {
				MessageBox.error("Backend OData service not connected.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			// Use Filter because the entity has a composite key
			var aFilters = [
				new sap.ui.model.Filter("GatePassReqNo", sap.ui.model.FilterOperator.EQ, sReqNo)
			];

			// Try reading from OutGatePassSet first
			oODataModel.read("/GateReqHdrSet", {
				filters: aFilters,
				urlParameters: {
					"$expand": "GateReqItmNav"
				},
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var oResult = oData.results && oData.results[0];

					if (oResult) {
						var sStatus = this._getNormalizedStatus(oResult);
						// console.log("oResult:", oResult);
						// console.log("Approval Status:", sStatus);
						if (sStatus === "APPROVED" || sStatus === "CLOSED" || sStatus === "CANCELLED") {
							this._validateAndMapData(oResult);
							if (sStatus === "CLOSED") {
								var oOutModel = this.getView().getModel("out");
								oOutModel.setProperty("/ApprovalStatus", "CLOSED");
								oOutModel.setProperty("/ApprovalState", "Success");
								oOutModel.setProperty("/ApprovalIcon", "sap-icon://sys-enter-2");
							} else if (sStatus === "CANCELLED") {
								var oOutModel = this.getView().getModel("out");
								oOutModel.setProperty("/ApprovalStatus", "CANCELLED");
								oOutModel.setProperty("/ApprovalState", "Error");
								oOutModel.setProperty("/ApprovalIcon", "sap-icon://sys-cancel-2");
							}
						} else if (sStatus === "REJECTED") {
							sap.m.MessageBox.error("Request Number " + sReqNo + " has been Rejected.");
							this._validateAndMapData(oResult);
							var oOutModel = this.getView().getModel("out");
							oOutModel.setProperty("/ApprovalStatus", "REJECTED");
							oOutModel.setProperty("/ApprovalState", "Error");
							oOutModel.setProperty("/ApprovalIcon", "sap-icon://decline");
						} else {
							this._showApprovalFlow(oResult);
						}
					}
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					sap.m.MessageBox.error("Error fetching request " + sReqNo);
				}.bind(this)
			});
		},

		onNextSection: function (oEvent) {
			var oOutModel = this.getView().getModel("out");

			// Show the logistics section
			oOutModel.setProperty("/showLogistics", true);

			// Wait for UI to render then scroll
			setTimeout(function () {
				var oVBox = this.getView().byId("outGatePassPage").getContent()[0];
				var aItems = oVBox.getItems();
				// The Logistics panel is the one with visible binding
				var oLogistics = aItems.find(function (item) {
					return item.getMetadata().getName() === "sap.m.Panel" && item.getHeaderText() === "LOGISTICS & DOCUMENTS";
				});

				if (oLogistics && oLogistics.getDomRef()) {
					oLogistics.getDomRef().scrollIntoView({ behavior: "smooth", block: "start" });
				}
			}.bind(this), 100);
		},

		_getNormalizedStatus: function (oData) {
			if (!oData) {
				return "PENDING";
			}
			
			var s1 = oData.Approval1;
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			s1 = String(s1).trim().toUpperCase();

			var s2 = oData.Approval2;
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			s2 = String(s2).trim().toUpperCase();

			var sStatus = oData.Status;
			if (!sStatus || sStatus === "null" || sStatus === "undefined") sStatus = "";
			sStatus = String(sStatus).trim().toUpperCase();

			if (s1 === "R"  || s2 === "R")  return "REJECTED";
			if (s1 === "AM" || s2 === "AM") return "AMENDMENT";
			if (s2) return "APPROVED"; // If Store approved, it is fully approved
			if (s1 && !s2) return "STORE APPROVAL PENDING"; // Though the OutGatePass UI will handle this as pending usually
			
			if (sStatus === "CANCELLED" || sStatus === "CANCEL" || sStatus === "CAN") return "CANCELLED";
			if (sStatus === "CLOSED"    || sStatus === "C") return "CLOSED";

			return "PENDING";
		},

		_showApprovalFlow: function (oResult) {
			var oOutModel = this.getView().getModel("out");
			
			var s2 = oResult.Approval2;
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			var bStoreApproved = !!s2;

			var s1 = oResult.Approval1;
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			var bHODApproved = !!s1 || bStoreApproved;
			
			oOutModel.setProperty("/showApprovalFlow", true);
			oOutModel.setProperty("/HODApproved", bHODApproved);
			oOutModel.setProperty("/StoreApproved", bStoreApproved);
			oOutModel.setProperty("/StoreActive", bHODApproved || bStoreApproved);
			oOutModel.setProperty("/GatePassreqNo", oResult.GatePassReqNo || "");
			oOutModel.setProperty("/Department", oResult.Department || "");
			oOutModel.setProperty("/HODRemarks", oResult.HODRemarks || "");
			oOutModel.setProperty("/StoreRemarks", oResult.STORERemarks || "");
		},

		_validateAndMapData: function (oData) {
			var oOutModel = this.getView().getModel("out");

			var sReqNo = oData.GatePassReqNo || oData.GatePassreqNo || "";
			var aAttachments = [];

			// 1. Extract from payload if available
			if (oData.Base64Img1) {
				aAttachments.push({ name: "Attachment_1.jpg", content: oData.Base64Img1 });
			}
			if (oData.Base64Img2) {
				aAttachments.push({ name: "Attachment_2.jpg", content: oData.Base64Img2 });
			}
			if (oData.Base64Img3) {
				aAttachments.push({ name: "Attachment_3.jpg", content: oData.Base64Img3 });
			}
			if (oData.Base64Img4) {
				aAttachments.push({ name: "Attachment_4.jpg", content: oData.Base64Img4 });
			}

			// 2. Fallback to localStorage for local drafts
			if (aAttachments.length === 0 && sReqNo) {
				var sStored = localStorage.getItem("attachments_" + sReqNo);
				if (sStored) {
					try {
						aAttachments = JSON.parse(sStored);
					} catch(e) {}
				}
			}
			oOutModel.setProperty("/attachments", aAttachments);

			// Auto-detect navigation property
			var aItems = [];
			if (oData.OutgateNav && oData.OutgateNav.results) {
				aItems = oData.OutgateNav.results;
			} else if (oData.GateReqItmNav && oData.GateReqItmNav.results) {
				aItems = oData.GateReqItmNav.results;
			}
			// Mapping from OutGatePassSet sample payload
			oOutModel.setProperty("/GatePassreqNo", oData.GatePassReqNo || oData.GatePassreqNo);
			oOutModel.setProperty("/Base64Img1", oData.Base64Img1 || "");
			
			var sStatus = this._getNormalizedStatus(oData);
			oOutModel.setProperty("/ApprovalStatus", sStatus);

			// Set state and icon based on status
			var sState = "Warning";
			var sIcon = "sap-icon://alert";
			if (sStatus === "APPROVED") {
				sState = "Success";
				sIcon = "sap-icon://sys-enter-2";
			} else if (sStatus === "REJECTED") {
				sState = "Error";
				sIcon = "sap-icon://sys-cancel-2";
			} else if (sStatus === "AMENDMENT") {
				sState = "Information";
				sIcon = "sap-icon://edit";
			}
			oOutModel.setProperty("/ApprovalState", sState);
			oOutModel.setProperty("/ApprovalIcon", sIcon);
			oOutModel.setProperty("/GatePassNo", oData.GatePassNo || "");
			oOutModel.setProperty("/GatePassType", oData.GatePassType || "");
			oOutModel.setProperty("/GatePassDate", new Date().toLocaleDateString("en-GB").split("/").join("-"));
			oOutModel.setProperty("/ReturnableDate", oData.ReturnableDate || null);
			oOutModel.setProperty("/Requestor", oData.Requestor || "");
			oOutModel.setProperty("/Department", oData.Department);
			oOutModel.setProperty("/Vendor", oData.Vendor || oData.Lifnr || "");
			oOutModel.setProperty("/VendorName", oData.VendorName);
			oOutModel.setProperty("/VendorGST", oData.VendorGST);
			oOutModel.setProperty("/ZipCode", oData.ZipCode || oData.PostalCode || "");
			oOutModel.setProperty("/City", oData.City || "");
			oOutModel.setProperty("/FiscalYear", oData.FiscalYear || String(new Date().getFullYear()));
			var oLocalLogistics = null;
			try {
				var sCleanGPNo = (oData.GatePassNo || "").trim();
				var sCleanReqNo = (sReqNo || "").trim();
				var sLocal = (sCleanGPNo ? localStorage.getItem("logistics_" + sCleanGPNo) : null) || (sCleanReqNo ? localStorage.getItem("logistics_" + sCleanReqNo) : null);
				console.log("[GPMS Debug] _validateAndMapData: sCleanGPNo =", sCleanGPNo, "sCleanReqNo =", sCleanReqNo, "sLocal =", sLocal);
				if (sLocal) {
					oLocalLogistics = JSON.parse(sLocal);
				}
			} catch (e) {
				console.error("[GPMS Debug] _validateAndMapData error:", e);
			}

			var sTransName = oData.TransporterName || (oLocalLogistics ? oLocalLogistics.TransporterName : "") || "";
			var sTransGST  = oData.TransporterGST  || (oLocalLogistics ? oLocalLogistics.TransporterGST : "")  || "";
			var sEWayNo    = oData.EWayBillNo || (oLocalLogistics ? oLocalLogistics.EWayBillNo : "") || "";
			var sEWayDate  = oData.EWayBillDate || (oLocalLogistics ? oLocalLogistics.EWayBillDate : null);
			var sDCNotes   = oData.DCNotes || (oLocalLogistics ? oLocalLogistics.DCNotes : "") || "";

			oOutModel.setProperty("/TransporterName", sTransName);
			oOutModel.setProperty("/TransporterGST",  sTransGST);
			oOutModel.setProperty("/EWayBillNo",      sEWayNo);
			oOutModel.setProperty("/EWayBillDate",    sEWayDate);
			oOutModel.setProperty("/DCNotes",         sDCNotes);

			oOutModel.setProperty("/VendorAddress", (oData.City || "") + ", " + (oData.ZipCode || ""));
			oOutModel.setProperty("/VendorPerson", oData.VendorPerson || (oLocalLogistics ? oLocalLogistics.VendorPerson : "") || "");
			oOutModel.setProperty("/UserRemarks", oData.Remarks || "");
			oOutModel.setProperty("/HODRemarks", oData.HODRemarks || "");
			oOutModel.setProperty("/StoreRemarks", oData.STORERemarks || "");
			oOutModel.setProperty("/LRNnumber", oData.LRNumber || oData.LRNnumber || "");
			oOutModel.setProperty("/VehicleNo", oData.VehicleNo || "");
			oOutModel.setProperty("/ModeOfTransport", oData.ModeOfDispatch || "");
			oOutModel.setProperty("/Plant", oData.Plant || oData.Werks || "");
			oOutModel.setProperty("/Cocode", oData.Bukrs || oData.BUKRS || oData.Cocode || oData.CoCode || oData.CompanyCode || "");
			oOutModel.setProperty("/CommonDesc", oData.CommonDesc || (oLocalLogistics ? oLocalLogistics.CommonDesc : "") || "");
			oOutModel.setProperty("/InsuranceReq", oData.InsuranceReq || "NO");
			oOutModel.setProperty("/InsuranceRequired", (oData.InsuranceReq || "").toUpperCase() === "YES");
			oOutModel.setProperty("/InsuranceDate", oData.InsuranceDate || "");
			oOutModel.setProperty("/InsuranceAmount", oData.InsuranceAmount || 0);

			// Detect items from different potential navigation properties
			var aItems = [];
			if (oData.OutgateNav) {
				aItems = oData.OutgateNav.results || (Array.isArray(oData.OutgateNav) ? oData.OutgateNav : []);
			} else if (oData.GateReqItmNav) {
				aItems = oData.GateReqItmNav.results || (Array.isArray(oData.GateReqItmNav) ? oData.GateReqItmNav : []);
			} else if (oData.GateReqItemNav) {
				aItems = oData.GateReqItemNav.results || (Array.isArray(oData.GateReqItemNav) ? oData.GateReqItemNav : []);
			}

			var aMappedItems = aItems.map(function (it, index) {
				// Handle field name variations across different sets
				var fQty = parseFloat(it.RequestedQuantity || it.Quantity || it.Menge || it.RequestedQty || it.Requestedqty || it.Qty || 0);
				var fRate = parseFloat(it.ItemNetPrice || it.Rate || it.Netpr || it.NetPrice || 0);
				var fTotal = parseFloat(it.Totalvalue || it.TotalValue || it.Netwr || (fQty * fRate));

				return {
					sno: index + 1,
					material: it.Material || it.Matnr || "",
					materialName: it.MaterialDesc || it.MaterialName || it.Description || it.Maktx || it.HSNDesc || it.Material || it.Matnr || "",
					hsnCode: it.HSNCode || it.Hsncode || "",
					hsnDesc: it.HSNDesc || "",
					sentQty: fQty,
					recvdQty: 0,
					balQty: fQty,
					uom: it.UOM || it.Uom || it.Meins || "EA",
					rate: fRate,
					amount: fTotal
				};
			});
			oOutModel.setProperty("/items", aMappedItems);

			// Recalc Total
			var fTotal = aMappedItems.reduce(function (sum, it) { return sum + it.amount; }, 0);
			oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));

			// Gate pass already exists — show logistics section immediately
			if ((oData.GatePassNo || "").trim()) {
				oOutModel.setProperty("/showLogistics", true);
				var sChallan = oData.ChallanNumber || (oLocalLogistics ? oLocalLogistics.ChallanNumber : "") || "";
				oOutModel.setProperty("/ChallanNumber", sChallan);
				oOutModel.setProperty("/ChallanDate", oData.ChallanDate || null);
				oOutModel.setProperty("/EWayBillNo", oData.EWayBillNo || "");
				oOutModel.setProperty("/EWayBillDate", oData.EWayBillDate || null);
				oOutModel.setProperty("/DCNotes", oData.DCNotes || "");
				oOutModel.setProperty("/DocOptionIndex", sChallan ? 1 : 0);
				var sStatusVal;
				if (oLocalLogistics && oLocalLogistics.GPStatus) {
					sStatusVal = oLocalLogistics.GPStatus.trim().toUpperCase();
				} else if (oData.GPStatus && oData.GPStatus.trim().toUpperCase() !== "OPEN" && oData.GPStatus.trim() !== "") {
					sStatusVal = oData.GPStatus.trim().toUpperCase();
				} else {
					sStatusVal = "OPEN";
				}
				if (sStatusVal === "AWAITING FOR RETURN" || sStatusVal === "AWAITING ACKNOWLEDGEMENT") {
					sStatusVal = "AWAITING FOR VENDOR ACKNOWLEDGEMENT";
				}
				console.log("[GPMS Debug] _validateAndMapData: setting /Status =", sStatusVal);
				oOutModel.setProperty("/Status", sStatusVal);
				// Restore Transport By radio: Self if name matches company, else Vendor
				var sSavedTransporter = oData.TransporterName || "";
				var bIsSelf = (sSavedTransporter === "MEIL Neyveli Energy Private Limited");
				oOutModel.setProperty("/TransportByIndex", bIsSelf ? 0 : 1);
			}
			oOutModel.refresh(true);

			// Always check OutGatePassSet directly to load the latest saved logistics and status details
			var sReqNo = oData.GatePassReqNo || oData.GatePassreqNo || "";
			var sGPType = oData.GatePassType || "";
			if (sReqNo) {
				this._checkExistingGatePass(sReqNo, sGPType);
			}
		},

		_checkExistingGatePass: function (sReqNo, sGPType) {
			var oODataModel = this.getOwnerComponent().getModel();
			var oOutModel = this.getView().getModel("out");
			if (!oODataModel) { return; }

			var aFilters = [new sap.ui.model.Filter("GatePassreqNo", sap.ui.model.FilterOperator.EQ, sReqNo)];
			if (sGPType) {
				aFilters.push(new sap.ui.model.Filter("GatePassType", sap.ui.model.FilterOperator.EQ, sGPType));
			}

			oODataModel.read("/OutGatePassSet", {
				filters: aFilters,
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					var aResults = oData.results || [];
					var oGP = aResults.find(function (r) {
						return (r.GatePassreqNo || "").trim() === sReqNo.trim();
					});
					console.log("[GPMS Debug] _checkExistingGatePass response: matched =", JSON.stringify(oGP ? { GatePassNo: oGP.GatePassNo, GatePassreqNo: oGP.GatePassreqNo } : "none"), "total results =", aResults.length);
					if (!oGP || !(oGP.GatePassNo || "").trim()) { return; }

					oOutModel.setProperty("/GatePassNo", oGP.GatePassNo);
					oOutModel.setProperty("/GatePassType", oGP.GatePassType || oOutModel.getProperty("/GatePassType"));
					var vGPDate = oGP.GpDate || oGP.GatePassDate;
					var sGPDateDisplay = "";
					if (vGPDate instanceof Date) {
						sGPDateDisplay = vGPDate.toLocaleDateString("en-GB").split("/").join("-");
					} else if (typeof vGPDate === "string" && /^\d{8}$/.test(vGPDate)) {
						sGPDateDisplay = vGPDate.slice(6, 8) + "-" + vGPDate.slice(4, 6) + "-" + vGPDate.slice(0, 4);
					} else if (vGPDate) {
						var dParsed = new Date(vGPDate);
						sGPDateDisplay = isNaN(dParsed.getTime()) ? "" : dParsed.toLocaleDateString("en-GB").split("/").join("-");
					}
					oOutModel.setProperty("/GatePassDate", sGPDateDisplay || new Date().toLocaleDateString("en-GB").split("/").join("-"));
					oOutModel.setProperty("/showLogistics", true);
					oOutModel.setProperty("/ChallanDate", oGP.ChallanDate || null);
					var oLocalLogistics2 = null;
					try {
						var sCleanGP2 = (oGP.GatePassNo || "").trim();
						var sCleanReq2 = (sReqNo || "").trim();
						var sLocal2 = (sCleanGP2 ? localStorage.getItem("logistics_" + sCleanGP2) : null) || (sCleanReq2 ? localStorage.getItem("logistics_" + sCleanReq2) : null);
						console.log("[GPMS Debug] _checkExistingGatePass: sCleanGP2 =", sCleanGP2, "sCleanReq2 =", sCleanReq2, "sLocal2 =", sLocal2);
						if (sLocal2) {
							oLocalLogistics2 = JSON.parse(sLocal2);
						}
					} catch (e) {
						console.error("[GPMS Debug] _checkExistingGatePass error:", e);
					}

					oOutModel.setProperty("/EWayBillNo", oGP.EWayBillNo || (oLocalLogistics2 ? oLocalLogistics2.EWayBillNo : ""));
					oOutModel.setProperty("/EWayBillDate", oGP.EWayBillDate || (oLocalLogistics2 ? oLocalLogistics2.EWayBillDate : null));
					oOutModel.setProperty("/DCNotes", oGP.DCNotes || (oLocalLogistics2 ? oLocalLogistics2.DCNotes : ""));
					var sCurrentStatus = (oOutModel.getProperty("/Status") || "").trim().toUpperCase();
					var sGPStatusVal;
					if (oLocalLogistics2 && oLocalLogistics2.GPStatus) {
						sGPStatusVal = oLocalLogistics2.GPStatus.trim().toUpperCase();
					} else if (oGP.GPStatus && oGP.GPStatus.trim().toUpperCase() !== "OPEN" && oGP.GPStatus.trim() !== "") {
						sGPStatusVal = oGP.GPStatus.trim().toUpperCase();
					} else {
						// Don't overwrite with "OPEN" from backend — keep what was already set
						sGPStatusVal = sCurrentStatus || "OPEN";
					}
					if (sGPStatusVal === "AWAITING FOR RETURN" || sGPStatusVal === "AWAITING ACKNOWLEDGEMENT") {
						sGPStatusVal = "AWAITING FOR VENDOR ACKNOWLEDGEMENT";
					}
					console.log("[GPMS Debug] _checkExistingGatePass: setting /Status =", sGPStatusVal);
					oOutModel.setProperty("/Status", sGPStatusVal);
					oOutModel.setProperty("/LRNnumber", oGP.LRNumber || oGP.LRNnumber || oOutModel.getProperty("/LRNnumber"));
					oOutModel.setProperty("/VehicleNo", oGP.VehicleNo || oOutModel.getProperty("/VehicleNo"));
					oOutModel.setProperty("/ModeOfTransport", oGP.ModeOfDispatch || oOutModel.getProperty("/ModeOfTransport"));
					oOutModel.setProperty("/TransporterName", oGP.TransporterName || (oLocalLogistics2 ? oLocalLogistics2.TransporterName : "") || oOutModel.getProperty("/TransporterName"));
					oOutModel.setProperty("/TransporterGST", oGP.TransporterGST || (oLocalLogistics2 ? oLocalLogistics2.TransporterGST : "") || oOutModel.getProperty("/TransporterGST"));
					// Restore Transport By radio: Self if name matches company, else Vendor
					var sSavedTransporter2 = oGP.TransporterName || "";
					var bIsSelf2 = (sSavedTransporter2 === "MEIL Neyveli Energy Private Limited");
					oOutModel.setProperty("/TransportByIndex", bIsSelf2 ? 0 : 1);
					// Restore DC option
					oOutModel.setProperty("/DocOptionIndex", oGP.ChallanNumber ? 1 : 0);
					oOutModel.setProperty("/NoOfPackages", oGP.NoOfPacakages || 0);
					oOutModel.refresh(true);

					// Remap items from gate pass navigation if present
					var aRaw = (oGP.OutgateNav && oGP.OutgateNav.results) || [];
					if (aRaw.length > 0) {
						var aMapped = aRaw.map(function (it, i) {
							var fQty = parseFloat(it.SentQuantity || it.Quantity || 0);
							var fRate = parseFloat(it.ItemNetPrice || it.Rate || 0);
							return {
								sno: i + 1,
								material: it.Material || "",
								materialName: it.HSNDesc || it.MaterialDesc || it.Material || "",
								hsnCode: it.HSNCode || "",
								sentQty: fQty,
								recvdQty: 0,
								balQty: fQty,
								uom: it.UOM || "EA",
								rate: fRate,
								amount: parseFloat((fQty * fRate).toFixed(2))
							};
						});
						oOutModel.setProperty("/items", aMapped);
						var fTotal = aMapped.reduce(function (s, it) { return s + it.amount; }, 0);
						oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 }));
					}

					// Extract attachments from gate pass if they weren't in the request
					var aAttachments = oOutModel.getProperty("/attachments") || [];
					if (aAttachments.length === 0) {
						if (oGP.Base64Img1) aAttachments.push({ name: "Attachment_1.jpg", content: oGP.Base64Img1 });
						if (oGP.Base64Img2) aAttachments.push({ name: "Attachment_2.jpg", content: oGP.Base64Img2 });
						if (oGP.Base64Img3) aAttachments.push({ name: "Attachment_3.jpg", content: oGP.Base64Img3 });
						if (oGP.Base64Img4) aAttachments.push({ name: "Attachment_4.jpg", content: oGP.Base64Img4 });
						oOutModel.setProperty("/attachments", aAttachments);
					}

				}.bind(this),
				error: function () { /* silent — if lookup fails, leave form as-is */ }
			});
		},

		onItemUpdate: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("out");
			var oItem = oCtx.getObject();
			var oOutModel = this.getView().getModel("out");

			var fQty = parseFloat(oItem.sentQty || 0);
			var fRate = parseFloat(oItem.rate || 0);
			oItem.amount = parseFloat((fQty * fRate).toFixed(2));
			oItem.balQty = fQty; // Assuming balance is reset on amendment resubmit

			oOutModel.refresh(true);
			this._recalculateFinalTotal();
		},

		_recalculateFinalTotal: function () {
			var oOutModel = this.getView().getModel("out");
			var aItems = oOutModel.getProperty("/items") || [];
			var fTotal = aItems.reduce(function (sum, it) { return sum + parseFloat(it.amount || 0); }, 0);
			oOutModel.setProperty("/FinalTotal", fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
		},

		onCommonDescEdit: function (oEvent) {
			var oSource = oEvent.getSource();
			var oModel = this.getView().getModel("out");
			var sInitialVal = oModel.getProperty("/CommonDesc") || "";

			var oConfirmButton = new sap.m.Button({
				text: "Confirm",
				type: "Emphasized",
				enabled: sInitialVal.length <= 500,
				press: function () {
					oModel.setProperty("/CommonDesc", oTextArea.getValue().trim());
					oDialog.close();
				}
			});

			var oTextArea = new sap.m.TextArea({
				value: sInitialVal,
				rows: 6,
				maxLength: 500,
				showExceededText: true,
				width: "100%",
				placeholder: "Enter common description...",
				liveChange: function (oEvent) {
					var sVal = oEvent.getParameter("value") || "";
					var iLen = sVal.length;
					if (iLen > 500) {
						oConfirmButton.setEnabled(false);
					} else {
						oConfirmButton.setEnabled(true);
					}
				}
			});

			var oDialog = new sap.m.Dialog({
				title: "Common Description",
				contentWidth: "460px",
				content: [
					new sap.m.VBox({
						class: "sapUiSmallMarginBeginEnd sapUiSmallMarginTopBottom",
						items: [oTextArea]
					})
				],
				beginButton: oConfirmButton,
				endButton: new sap.m.Button({
					text: "Cancel",
					press: function () { oDialog.close(); }
				}),
				afterClose: function () { oDialog.destroy(); }
			});

			this.getView().addDependent(oDialog);
			oDialog.open();
		},

		onNavHome: function () {
			this.getRouter().navTo("home");
		},

		onAttachmentPress: function (oEvent) {
			var oContext = oEvent.getSource().getBindingContext("out");
			var oAttachment = oContext.getObject();
			if (oAttachment && oAttachment.content) {
				var newTab = window.open();
				if (newTab) {
					newTab.document.write('<iframe src="' + oAttachment.content + '" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>');
				} else {
					var link = document.createElement('a');
					link.href = oAttachment.content;
					link.download = oAttachment.name;
					link.click();
				}
			}
		},

		onApproveInMyInbox: function () {
			window.open("https://10.5.18.54:44300/sap/bc/ui2/flp?sap-client=300&sap-language=EN", "_blank");
		},

		onGenerateDC: async function (bGetBase64, bSkipOData) {
			var oOutModel = this.getView().getModel("out");
			var oOut = oOutModel.getData();

			if (bSkipOData !== true && bGetBase64 !== true && typeof bGetBase64 !== "boolean") {
				// User clicked Generate DC button on UI
				oOutModel.setProperty("/ChallanNumber", "");
				oOut.ChallanNumber = "";
				
				this.onSaveLogistics(true);
				return;
			}
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('p', 'mm', 'a4');
			var margin = 15;
			var pageWidth = doc.internal.pageSize.width;
			var pageHeight = doc.internal.pageSize.height;
			var contentWidth = pageWidth - margin * 2;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// ── PAGE BORDER ──────────────────────────────────────────────────────
			doc.setLineWidth(0.6);
			doc.rect(8, 6, pageWidth - 16, pageHeight - 12);
			doc.setLineWidth(0.2);
			doc.rect(9.5, 7.5, pageWidth - 19, pageHeight - 15);

			// ── HEADER ───────────────────────────────────────────────────────────
			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			try {
				var sLogoBase64 = await this._getImageBase64(sLogoUrl);
				doc.addImage(sLogoBase64, 'PNG', margin, 10, 30, 11);
			} catch (e) {
				doc.setFont("helvetica", "bold");
				doc.setFontSize(18);
				doc.setTextColor(180, 0, 0);
				doc.text("M", margin + 5, 18);
				doc.setTextColor(0, 0, 0);
			}

			doc.setTextColor(0, 0, 0);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(13);
			doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
			doc.setFont("helvetica", "normal");
			doc.setFontSize(7.5);
			doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
			doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
			doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
			doc.setFont("helvetica", "bold");
			doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });

			// Thick separator below header
			doc.setLineWidth(0.5);
			doc.line(margin, 30.5, pageWidth - margin, 30.5);

			// ── DOCUMENT TITLE ───────────────────────────────────────────────────
			doc.setFont("helvetica", "bold");
			doc.setFontSize(11);
			doc.text("DELIVERY CHALLAN", pageWidth / 2, 37, { align: "center" });
			var titleW = doc.getTextWidth("DELIVERY CHALLAN");
			doc.setLineWidth(0.35);
			doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

			// ── INFO GRID (3 columns) ─────────────────────────────────────────────
			// Col1=To (62mm)  Col2=DC/Transport (65mm)  Col3=GP/Location (remaining)
			var gridY = 41;
			var gridH = 50;
			var col1W = 62, col2W = 65, col3W = contentWidth - col1W - col2W;
			var col1X = margin, col2X = margin + col1W, col3X = margin + col1W + col2W;
			var pad = 3, lh = 5.5;

			doc.setLineWidth(0.3);
			doc.rect(col1X, gridY, contentWidth, gridH);
			doc.line(col2X, gridY, col2X, gridY + gridH);
			doc.line(col3X, gridY, col3X, gridY + gridH);

			// Col 1 — Consignee
			doc.setFontSize(8.5);
			doc.setFont("helvetica", "bold");
			doc.text("To", col1X + pad, gridY + 8);
			doc.text(oOut.VendorName || "", col1X + 10, gridY + 8);
			doc.setFont("helvetica", "normal");
			doc.setFontSize(8);
			var splitAddr = doc.splitTextToSize(oOut.VendorAddress || "", col1W - 14);
			doc.text(splitAddr, col1X + 10, gridY + 14);
			doc.setLineWidth(0.2);
			doc.line(col1X, gridY + gridH - 10, col2X, gridY + gridH - 10);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8);
			doc.text("GST No:", col1X + pad, gridY + gridH - 4);
			doc.setFont("helvetica", "normal");
			doc.text(oOut.VendorGST || "", col1X + 22, gridY + gridH - 4);

			// Col 2 — DC & Transport
			var c2 = col2X + pad, valOff2 = 30, y2 = gridY + 8;
			doc.setLineWidth(0.3);
			doc.setFontSize(8);
			doc.setFont("helvetica", "bold"); doc.text("DC No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || "Draft", c2 + valOff2, y2);
			y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("DC Date:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(sDate, c2 + valOff2, y2);
			y2 += lh + 2;
			doc.setFont("helvetica", "bold"); doc.text("Mode Of Transport:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ModeOfTransport || "By Road", c2 + valOff2, y2);
			y2 += lh + 2;
			doc.setFont("helvetica", "bold"); doc.text("LR/Vehicle No:", c2, y2);
			doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", c2 + valOff2, y2);
			y2 += lh;
			doc.setFont("helvetica", "bold"); doc.text("Transporter Name:", c2, y2);
			doc.setFont("helvetica", "normal");
			var splitTrans = doc.splitTextToSize(oOut.TransporterName || oOut.VendorName || "Self", col2W - valOff2 - pad);
			doc.text(splitTrans, c2 + valOff2, y2);

			// Col 3 — GP & Location
			var c3 = col3X + pad, valOff3 = 27, y3 = gridY + 8;
			doc.setFontSize(8);
			doc.setFont("helvetica", "bold"); doc.text("GP No:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassNo || "", c3 + valOff3, y3);
			y3 += lh;
			doc.setFont("helvetica", "bold"); doc.text("GP Date:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(sDate, c3 + valOff3, y3);
			y3 += lh + 2;
			doc.setFont("helvetica", "bold"); doc.text("Despatch From:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text("Uthangal, Neyveli", c3 + valOff3, y3);
			y3 += lh + 2;
			doc.setFont("helvetica", "bold"); doc.text("Despatch To:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.City || "Neyveli", c3 + valOff3, y3);
			y3 += lh + 2;
			doc.setFont("helvetica", "bold"); doc.text("EWB No:", c3, y3);
			doc.setFont("helvetica", "normal"); doc.text(oOut.EWayBillNo || "", c3 + valOff3, y3);

			// ── ITEMS TABLE ──────────────────────────────────────────────────────
			var tableData = (oOut.items || []).map(function (item, index) {
				return [
					index + 1,
					item.materialName || "",
					item.hsnCode || "",
					item.uom || "",
					parseFloat(item.sentQty || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
					parseFloat(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
					parseFloat(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
				];
			});

			doc.autoTable({
				startY: gridY + gridH + 1,
				head: [['S.No', 'DESCRIPTION', 'HSN Code', 'UOM', 'QTY', 'Rate', 'Amt (In Rs.)']],
				body: tableData,
				theme: 'grid',
				headStyles: {
					fillColor: [235, 235, 235],
					textColor: [0, 0, 0],
					fontStyle: 'bold',
					fontSize: 8,
					halign: 'center',
					valign: 'middle',
					cellPadding: 3,
					lineWidth: 0.3,
					lineColor: [0, 0, 0]
				},
				bodyStyles: {
					fontSize: 8,
					cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
					lineColor: [0, 0, 0],
					lineWidth: 0.25,
					valign: 'middle'
				},
				alternateRowStyles: { fillColor: [250, 250, 250] },
				columnStyles: {
					0: { cellWidth: 12, halign: 'center' },
					1: { cellWidth: 'auto', halign: 'left' },
					2: { cellWidth: 25, halign: 'center' },
					3: { cellWidth: 16, halign: 'center' },
					4: { cellWidth: 20, halign: 'right' },
					5: { cellWidth: 22, halign: 'right' },
					6: { cellWidth: 27, halign: 'right' }
				},
				margin: { left: margin, right: margin }
			});

			var finalY = doc.lastAutoTable.finalY;
			var fTotal = oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0";
			var totalAmt = parseFloat(fTotal) || 0;

			// ── IN WORDS + TOTAL ROW ─────────────────────────────────────────────
			var footH = 9, totalColW = 49;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, footH);
			doc.line(pageWidth - margin - totalColW, finalY, pageWidth - margin - totalColW, finalY + footH);
			doc.setFont("helvetica", "normal");
			doc.setFontSize(8);
			doc.text("In Words :  Rupees " + this._numberToWords(Math.round(totalAmt)) + " Only.", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "bold");
			doc.text("Total", pageWidth - margin - totalColW + 3, finalY + 5.5);
			doc.text(
				totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
				pageWidth - margin - 3, finalY + 5.5, { align: "right" }
			);

			// ── NOTE SECTION ─────────────────────────────────────────────────────
			var noteY = finalY + footH + 3;
			var noteText = oOut.DCNotes || "Empty cylinders return to the vendor and there is no sale in this transaction.";
			var splitNote = doc.splitTextToSize(noteText, contentWidth - 22);
			var noteH = Math.max(10, splitNote.length * 5 + 6);
			doc.setLineWidth(0.25);
			doc.rect(margin, noteY, contentWidth, noteH);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8);
			doc.text("Note :", margin + 3, noteY + 6);
			doc.setFont("helvetica", "normal");
			doc.text(splitNote, margin + 18, noteY + 6);

			// ── DECLARATION ──────────────────────────────────────────────────────
			var declY = noteY + noteH + 6;
			doc.setFont("helvetica", "italic");
			doc.setFontSize(7.5);
			doc.text("We hereby certify that the above mentioned particulars are true and correct.", pageWidth / 2, declY, { align: "center" });

			// ── SIGNATURE SECTION ────────────────────────────────────────────────
			var sigY = declY + 22;
			var sigLineW = 48;
			doc.setLineWidth(0.3);
			doc.line(margin, sigY, margin + sigLineW, sigY);
			doc.line(pageWidth / 2 - sigLineW / 2, sigY, pageWidth / 2 + sigLineW / 2, sigY);
			doc.line(pageWidth - margin - sigLineW, sigY, pageWidth - margin, sigY);
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8);
			doc.text("Prepared By", margin + sigLineW / 2, sigY + 5, { align: "center" });
			doc.text("Store In-Charge", pageWidth / 2, sigY + 5, { align: "center" });
			doc.text("Authorised Signatory", pageWidth - margin - sigLineW / 2, sigY + 5, { align: "center" });
			doc.setFont("helvetica", "normal");
			doc.setFontSize(7);
			doc.text("For MEIL Neyveli Energy Private Limited", pageWidth / 2, sigY + 10, { align: "center" });

			doc.save("DC_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Delivery Challan Downloaded");
		},

		onGenerateEWay: async function () {
			var oOut = this.getView().getModel("out").getData();
			const { jsPDF } = window.jspdf;
			var doc = new jsPDF('p', 'mm', 'a4');
			var margin = 10;
			var pageWidth = doc.internal.pageSize.width;
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');

			// --- Page 1 Header ---
			doc.setFont("helvetica", "bold"); doc.setFontSize(14);
			doc.text("e-Way Bill", pageWidth / 2, 15, { align: "center" });

			// QR Code Generation
			var sQRData = "E-Way Bill: " + (oOut.EWayBillNo || "N/A") + "\n" +
				"Gate Pass: " + (oOut.GatePassNo || "N/A") + "\n" +
				"Date: " + sDate + "\n" +
				"Vehicle: " + (oOut.VehicleNo || "N/A");
			try {
				var sQRBase64 = await this._getQRCodeBase64(sQRData);
				doc.addImage(sQRBase64, 'PNG', pageWidth - 42, 8, 30, 30);
			} catch (e) {
				doc.rect(pageWidth - 42, 8, 30, 30);
				doc.setFontSize(7); doc.text("QR ERROR", pageWidth - 27, 23, { align: "center" });
			}

			// --- 1. E-way Bill Details ---
			var y = 42;
			doc.setFontSize(9); doc.text("1- E-way Bill Details", margin, y);
			doc.line(margin, y + 1, pageWidth - margin, y + 1);
			y += 6;
			doc.setFontSize(7.5);
			doc.text("E-way Bill No: " + (oOut.EWayBillNo || ""), margin, y);
			doc.text("Generated Date: " + sDate + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 75, y);
			doc.text("Generated By: " + (oOut.Cocode || ""), 145, y);
			y += 5;
			doc.text("Mode: " + (oOut.ModeOfTransport || ""), margin, y);
			doc.text("Type: Outward - Others", 75, y);
			doc.text("Transaction Type: Regular", 145, y);
			doc.line(margin, y + 3, pageWidth - margin, y + 3);

			// --- 2. Address Details ---
			y += 10;
			doc.setFont("helvetica", "bold"); doc.text("2- Address Details", margin, y);
			y += 4;
			doc.rect(margin, y, 92, 30); doc.rect(108, y, 92, 30);
			doc.setFontSize(7); doc.text("From", margin + 1, y - 1); doc.text("To", 109, y - 1);
			doc.text("GSTIN : " + (oOut.CocodeGST || "33AACCS2753B1ZV"), margin + 2, y + 5);
			doc.text("MEIL NEYVELI ENERGY PRIVATE LIMITED", margin + 2, y + 10);
			doc.text("GSTIN : " + (oOut.VendorGST || ""), 110, y + 5);
			doc.text(oOut.VendorName || "", 110, y + 10);

			// --- 3. Goods Details ---
			y += 40;
			doc.setFont("helvetica", "bold"); doc.text("3- Goods Details", margin, y);
			var goodsData = (oOut.items || []).map(function (item) {
				return [item.hsnCode, item.materialName, item.sentQty + " " + item.uom, item.amount, "0.00+0.00+0.00+0.00=0.00"];
			});
			doc.autoTable({
				startY: y + 2,
				head: [['HSN Code', 'Product Name & Desc.', 'Quantity', 'Taxable Amt', 'Tax Rate']],
				body: goodsData,
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
				styles: { fontSize: 7, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1 }
			});

			// --- 4 & 5: Logistics ---
			y = doc.lastAutoTable.finalY + 10;
			doc.text("4- Transportation Details", margin, y);
			doc.line(margin, y + 1, pageWidth - margin, y + 1);
			doc.setFont("helvetica", "normal"); doc.text("Transporter: " + (oOut.TransporterName || "Self"), margin, y + 6);

			y += 15;
			doc.setFont("helvetica", "bold"); doc.text("5- Vehicle Details", margin, y);
			doc.autoTable({
				startY: y + 2,
				head: [['Mode', 'Vehicle No', 'From', 'Date', 'Entered By']],
				body: [['Road', oOut.VehicleNo || "", 'Neyveli', sDate, 'System']],
				theme: 'grid',
				headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', lineWidth: 0.1 },
				styles: { fontSize: 7, cellPadding: 1.5 }
			});

			// --- Page 2: Certification ---
			doc.addPage();
			y = 40;
			doc.setFont("helvetica", "bold"); doc.setFontSize(12);
			doc.text("TO WHOMSOEVER IT MAY CONCERN", pageWidth / 2, y, { align: "center" });
			y += 15;
			doc.setFont("helvetica", "normal"); doc.setFontSize(10);
			var totalAmt = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0");
			var certText = "This is to certify that we are sending " + (oOut.items[0] ? oOut.items[0].materialName : "Materials") + " vide our " +
				(oOut.GatePassType || "Returnable") + " Gatepass No. " + (oOut.GatePassNo || "Draft") + " Dt. " + sDate + ", DC No. " + (oOut.ChallanNumber || "Draft") + " Dt. " + sDate +
				" from our " + (oOut.Plant || "") + " Power Plant to M/S. " + (oOut.VendorName || "") + ", " + (oOut.VendorAddress || "") + ". Through " + (oOut.VehicleNo || "") + "-" + (oOut.TransporterName || "Self") + ".";
			doc.text(doc.splitTextToSize(certText, pageWidth - 20), margin, y);
			doc.text("Value: Rs. " + totalAmt.toLocaleString() + "/- (" + this._numberToWords(Math.round(totalAmt)) + " Only)", margin, y + 30);

			doc.save("EWayBill_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("E-Way Bill Generated");
		},

		onPrintGatePass: async function () {
			var oOut = this.getView().getModel("out").getData();
			if (!oOut.GatePassNo) {
				MessageBox.warning("Please generate the Gate Pass first.");
				return;
			}

			const { jsPDF } = window.jspdf;
			// Landscape A4
			var doc = new jsPDF('l', 'mm', 'a4');
			var pageWidth = doc.internal.pageSize.width;    // 297mm
			var pageHeight = doc.internal.pageSize.height;  // 210mm
			var margin = 12;
			var contentWidth = pageWidth - margin * 2;       // 273mm
			var sDate = new Date().toLocaleDateString('en-GB').split('/').join('-');
			var fTotal = parseFloat(oOut.FinalTotal ? oOut.FinalTotal.toString().replace(/,/g, '') : "0") || 0;
			var sType = oOut.GatePassType || "NRGP";
			var sTypeLabel = sType === "RGP" ? "RETURNABLE GATE PASS" : "NON-RETURNABLE GATE PASS";

			var sLogoUrl = sap.ui.require.toUrl("zgpms/meilpower/com/images/meil_logo.png");
			var sLogoBase64 = null;
			try {
				sLogoBase64 = await this._getImageBase64(sLogoUrl);
			} catch (e) { /* logo optional */ }

			var titleW = doc.getTextWidth(sTypeLabel);
			var gridY = 41, gridH = 32;
			var lColW = 148, rColW = contentWidth - lColW;
			var lColX = margin, rColX = margin + lColW;
			var pad = 3, rLH = 5.5;
			var splitAddr = doc.splitTextToSize(oOut.VendorAddress || "", lColW - pad * 2 - 2);
			var lblOff = 30;

			// ── ITEMS TABLE ──────────────────────────────────────────────────────
			var tableData = (oOut.items || []).map(function (it, i) {
				return [
					i + 1,
					it.materialName || "",
					it.hsnCode || "",
					parseFloat(it.sentQty || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
					it.uom || "",
					parseFloat(it.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
					parseFloat(it.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
				];
			});
			while (tableData.length < 6) { tableData.push(["", "", "", "", "", "", ""]); }

			doc.autoTable({
				startY: 74,
				head: [['S.No', 'DESCRIPTION OF GOODS', 'HSN Code', 'Outward QTY', 'UOM', 'Rate (Rs.)', 'Value (Rs.)']],
				body: tableData,
				theme: 'grid',
				headStyles: {
					fillColor: [235, 235, 235],
					textColor: [0, 0, 0],
					fontStyle: 'bold',
					fontSize: 8.5,
					halign: 'center',
					valign: 'middle',
					cellPadding: 3,
					lineWidth: 0.3,
					lineColor: [0, 0, 0]
				},
				bodyStyles: {
					fontSize: 8.5,
					cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
					lineColor: [0, 0, 0],
					lineWidth: 0.25,
					valign: 'middle'
				},
				alternateRowStyles: { fillColor: [250, 250, 250] },
				columnStyles: {
					0: { cellWidth: 14, halign: 'center' },
					1: { cellWidth: 'auto', halign: 'left' },
					2: { cellWidth: 26, halign: 'center' },
					3: { cellWidth: 30, halign: 'right' },
					4: { cellWidth: 18, halign: 'center' },
					5: { cellWidth: 30, halign: 'right' },
					6: { cellWidth: 34, halign: 'right' }
				},
				margin: { top: 74, left: margin, right: margin, bottom: 60 },
				didDrawPage: function (data) {
					// Draw outer borders
					doc.setLineWidth(0.6);
					doc.rect(7, 5, pageWidth - 14, pageHeight - 10);
					doc.setLineWidth(0.2);
					doc.rect(8.5, 6.5, pageWidth - 17, pageHeight - 13);

					// Logo
					if (sLogoBase64) {
						doc.addImage(sLogoBase64, 'PNG', margin, 9, 32, 12);
					} else {
						doc.setFont("helvetica", "bold");
						doc.setFontSize(18);
						doc.setTextColor(180, 0, 0);
						doc.text("MEIL", margin, 18);
						doc.setTextColor(0, 0, 0);
					}

					// Company Info
					doc.setTextColor(0, 0, 0);
					doc.setFont("helvetica", "bold");
					doc.setFontSize(14);
					doc.text("MEIL Neyveli Energy Private Limited", pageWidth / 2, 13, { align: "center" });
					doc.setFont("helvetica", "normal");
					doc.setFontSize(7.5);
					doc.text("(Formerly TAQA Neyveli Power Company Private Limited)", pageWidth / 2, 17, { align: "center" });
					doc.text("250MW LFPP, Uthangal, Neyveli, Tamilnadu - 607804, India.", pageWidth / 2, 20.5, { align: "center" });
					doc.text("Tel : +91-4142-270300  |  Fax : +91-4142-270401", pageWidth / 2, 24, { align: "center" });
					doc.setFont("helvetica", "bold");
					doc.text("GSTIN : 33AACCS2753B1ZV  |  CIN : U40109TN1993PTC026223", pageWidth / 2, 27.5, { align: "center" });

					// GP No & Date
					doc.setFontSize(8.5);
					doc.setFont("helvetica", "bold");
					doc.text("GP No : " + (oOut.GatePassNo || ""), pageWidth - margin, 12, { align: "right" });
					doc.setFont("helvetica", "normal");
					doc.text("Date : " + sDate, pageWidth - margin, 17, { align: "right" });

					// Separator
					doc.setLineWidth(0.5);
					doc.line(margin, 30.5, pageWidth - margin, 30.5);

					// Title
					doc.setFont("helvetica", "bold");
					doc.setFontSize(11);
					doc.text(sTypeLabel, pageWidth / 2, 37, { align: "center" });
					doc.setLineWidth(0.35);
					doc.line(pageWidth / 2 - titleW / 2, 38.5, pageWidth / 2 + titleW / 2, 38.5);

					// Info Grid Box
					doc.setLineWidth(0.3);
					doc.rect(lColX, gridY, contentWidth, gridH);
					doc.line(rColX, gridY, rColX, gridY + gridH);
					doc.setLineWidth(0.2);
					doc.line(lColX, gridY + 9, rColX, gridY + 9);

					// Left Column Info
					doc.setFontSize(8.5);
					doc.setFont("helvetica", "normal");
					doc.text("Please allow", lColX + pad, gridY + 6);
					doc.setFont("helvetica", "bold");
					doc.text(oOut.VendorPerson || "Mr./Ms.", lColX + 34, gridY + 6);
					doc.text(oOut.VendorName || "", lColX + pad, gridY + 14);
					doc.setFont("helvetica", "normal");
					doc.text(splitAddr, lColX + pad, gridY + 19.5);
					doc.setFont("helvetica", "italic");
					doc.setFontSize(8);
					doc.text("to take out the following material from MEIL premises.", lColX + pad, gridY + gridH - 3.5);

					// Right Column Info
					var rc = rColX + pad, ry = gridY + 6;
					doc.setFontSize(8.5);
					doc.setFont("helvetica", "bold"); doc.text("Req. No:", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassreqNo || "", rc + lblOff, ry);
					ry += rLH;
					doc.setFont("helvetica", "bold"); doc.text("GP Type:", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(sType, rc + lblOff, ry);
					ry += rLH;
					doc.setFont("helvetica", "bold"); doc.text("Department:", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", rc + lblOff, ry);
					ry += rLH;
					doc.setFont("helvetica", "bold"); doc.text("Vehicle No:", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.VehicleNo || "", rc + lblOff, ry);
					ry += rLH;
					doc.setFont("helvetica", "bold"); doc.text("Vendor GST:", rc, ry);
					doc.setFont("helvetica", "normal"); doc.text(oOut.VendorGST || "", rc + lblOff, ry);

					// Page Number
					doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
					doc.text("Page " + data.pageNumber, pageWidth - margin, pageHeight - 7, { align: "right" });
				}
			});

			var finalY = doc.lastAutoTable.finalY;

			// ── IN WORDS + TOTAL ROW ─────────────────────────────────────────────
			var footH = 9, totalColW = 64;
			doc.setLineWidth(0.25);
			doc.rect(margin, finalY, contentWidth, footH);
			doc.line(pageWidth - margin - totalColW, finalY, pageWidth - margin - totalColW, finalY + footH);
			doc.setFont("helvetica", "normal"); doc.setFontSize(8);
			doc.text("In Words :  Rupees " + this._numberToWords(Math.round(fTotal)) + " Only.", margin + 3, finalY + 5.5);
			doc.setFont("helvetica", "bold");
			doc.text("Total Value (Rs.)", pageWidth - margin - totalColW + 3, finalY + 5.5);
			doc.text(
				fTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
				pageWidth - margin - 3, finalY + 5.5, { align: "right" }
			);

			// ── REMARKS ROW ──────────────────────────────────────────────────────
			var remY = finalY + footH + 1, remH = 8;
			doc.setLineWidth(0.25);
			doc.rect(margin, remY, contentWidth, remH);
			doc.line(margin + 28, remY, margin + 28, remY + remH);
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			doc.text("Remarks:", margin + 3, remY + 5);
			doc.setFont("helvetica", "normal");
			doc.text(doc.splitTextToSize(oOut.UserRemarks || "NIL", contentWidth - 33), margin + 31, remY + 5);

			// ── META INFO ROW ─────────────────────────────────────────────────────
			var metaY = remY + remH + 3;
			doc.setFontSize(8);
			// Row 1
			doc.setFont("helvetica", "bold"); doc.text("Req. No:", margin, metaY);
			doc.setFont("helvetica", "normal"); doc.text(oOut.GatePassreqNo || "", margin + 18, metaY);
			doc.setFont("helvetica", "bold"); doc.text("Requestor:", margin + 70, metaY);
			doc.setFont("helvetica", "normal"); doc.text(oOut.Requestor || "", margin + 90, metaY);
			doc.setFont("helvetica", "bold"); doc.text("Department:", margin + 150, metaY);
			doc.setFont("helvetica", "normal"); doc.text(oOut.Department || "", margin + 172, metaY);
			// Row 2
			metaY += 5;
			doc.setFont("helvetica", "bold"); doc.text("Approved By:", margin, metaY);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ApprovedBy || "Pending", margin + 24, metaY);
			doc.setFont("helvetica", "bold"); doc.text("DC No:", margin + 70, metaY);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ChallanNumber || "N/A", margin + 84, metaY);
			doc.setFont("helvetica", "bold"); doc.text("Mode:", margin + 150, metaY);
			doc.setFont("helvetica", "normal"); doc.text(oOut.ModeOfTransport || "", margin + 162, metaY);

			// ── SIGNATURE SECTION ────────────────────────────────────────────────
			var sigY = metaY + 16;
			var sigLineW = 52;
			var sigGap = (contentWidth - sigLineW * 4) / 3;
			var sigPositions = [margin, margin + sigLineW + sigGap, margin + (sigLineW + sigGap) * 2, margin + (sigLineW + sigGap) * 3];
			var sigLabels = ["Requested By", "HOD Approval", "Store In-Charge", "Security / Gate"];

			doc.setLineWidth(0.3);
			sigPositions.forEach(function (sx) {
				doc.line(sx, sigY, sx + sigLineW, sigY);
			});
			doc.setFont("helvetica", "bold"); doc.setFontSize(8);
			sigPositions.forEach(function (sx, i) {
				doc.text(sigLabels[i], sx + sigLineW / 2, sigY + 5, { align: "center" });
			});
			doc.setFont("helvetica", "normal"); doc.setFontSize(7);
			doc.text("For MEIL Neyveli Energy Private Limited", pageWidth / 2, sigY + 10, { align: "center" });

			doc.save("GatePass_" + (oOut.GatePassNo || "Draft") + ".pdf");
			MessageToast.show("Gate Pass Printed");
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

		onTransportByChange: function (oEvent) {
			var iIndex = oEvent.getParameter("selectedIndex");
			var oOutModel = this.getView().getModel("out");
			if (iIndex === 0) {
				// Self — auto-fill company name and GST
				oOutModel.setProperty("/TransporterName", "MEIL Neyveli Energy Private Limited");
				oOutModel.setProperty("/TransporterGST", "33AACCS2753B1ZV");
			} else {
				// Vendor — clear fields so store person can enter transporter details manually
				oOutModel.setProperty("/TransporterName", "");
				oOutModel.setProperty("/TransporterGST", "");
			}
			oOutModel.setProperty("/TransportByIndex", iIndex);
		},

		onDocOptionChange: function () {
			// Logic to show/hide document buttons handled via visibility bindings in XML
		},

		onInsuranceRequiredCheckBoxSelect: function (oEvent) {
			var bSelected = oEvent.getParameter("selected");
			var oOutModel = this.getView().getModel("out");
			var oOutData = oOutModel ? oOutModel.getData() : {};

			if (bSelected) {
				if (!this._pInsuranceDialog) {
					this._pInsuranceDialog = sap.ui.core.Fragment.load({
						id: this.getView().getId(),
						name: "zgpms.meilpower.com.view.fragments.InwardInsuranceDialog",
						controller: this
					}).then(function (oDialog) {
						this.getView().addDependent(oDialog);
						var oModel = new sap.ui.model.json.JSONModel({});
						oDialog.setModel(oModel, "insurance");
						return oDialog;
					}.bind(this));
				}
				this._pInsuranceDialog.then(function (oDialog) {
					var oInsModel = oDialog.getModel("insurance");
					oInsModel.setData({
						InvoiceNo: oOutData.GatePassreqNo || "",
						InsuranceDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
						ReceivedDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
						Vendor: oOutData.VendorName || "",
						VendorAddress: oOutData.VendorAddress || "",
						ModeOfTransport: oOutData.ModeOfTransport || "Road",
						LRNumber: oOutData.LRNnumber || "",
						VehicleNo: oOutData.VehicleNo || "",
						InvoiceValue: oOutData.FinalTotal ? oOutData.FinalTotal.toString().replace(/,/g, "") : "",
						RgpDescription: oOutData.CommonDesc || ""
					});
					oDialog.open();
				});
			}
		},

		onInsuranceSubmit: function () {
			var oOutModel = this.getView().getModel("out");
			this._pInsuranceDialog.then(function (oDialog) {
				var oInsData = oDialog.getModel("insurance").getData();
				var sDate = oInsData.InsuranceDate || "";
				var aParts = sDate.split("-");
				var sFormatted = (aParts.length === 3) ? aParts[2] + aParts[1] + aParts[0] : sDate;
				oOutModel.setProperty("/InsuranceRequired", true);
				oOutModel.setProperty("/InsuranceDate", sFormatted);
				oOutModel.setProperty("/InsuranceAmount", oInsData.InvoiceValue || "");
				oDialog.close();
			});
			sap.m.MessageToast.show("Insurance details saved.");
		},

		onInsuranceCancel: function () {
			this.byId("idInsuranceRequiredCheckBox").setSelected(false);
			this._pInsuranceDialog.then(function (oDialog) {
				oDialog.close();
			});
		},

		_resubmitAmendmentRequest: function () {
			var oOut = this.getView().getModel("out").getData();
			var oODataModel = this.getModel();
			if (!oODataModel) {
				MessageBox.warning("Backend service not available.");
				return;
			}

			// Format dates as YYYYMMDD for SAP OData compatibility
			var fnFormatDate = function (oDate) {
				if (!oDate) return "";
				if (typeof oDate === "string" && oDate.length === 8 && !isNaN(oDate)) {
					return oDate;
				}
				var d = new Date(oDate);
				if (isNaN(d.getTime())) return "";
				var y = d.getFullYear();
				var m = String(d.getMonth() + 1).padStart(2, '0');
				var day = String(d.getDate()).padStart(2, '0');
				return y + m + day;
			};

			var sToday = new Date().toISOString().split('T')[0];
			var sGpDateSAP = fnFormatDate(sToday);
			
			// Map returnable date if RGP
			var sReturnableDateSAP = "";
			if (oOut.GatePassType === "RGP") {
				sReturnableDateSAP = oOut.ExtendedReturnableDate ? fnFormatDate(oOut.ExtendedReturnableDate) : sGpDateSAP;
			}

			var oPayload = {
				GatePassReqNo: oOut.GatePassreqNo || "",
				GatePassType: oOut.GatePassType || "RGP",
				Cocode: oOut.Cocode || "",
				Plant: oOut.Plant || "",
				FiscalYear: oOut.FiscalYear || String(new Date().getFullYear()),
				GpDate: sGpDateSAP,
				Vendor: oOut.Vendor || "",
				VendorName: oOut.VendorName || "",
				VendorGST: oOut.VendorGST || "",
				ZipCode: oOut.ZipCode || "",
				City: oOut.City || "",
				ApprovalReq: "X",
				Approval1: "",
				Approval2: "",
				Department: oOut.Department || "",
				VehicleNo: oOut.VehicleNo || "",
				ModeOfDispatch: oOut.ModeOfTransport || "",
				Remarks: oOut.UserRemarks || "",
				ReturnableDate: sReturnableDateSAP,

				GateReqItemNav: (oOut.items || []).map(function (it, index) {
					var fQty = parseFloat(it.sentQty || 0);
					var fRate = parseFloat(it.rate || 0);
					var fValue = fQty * fRate;

					return {
						GatePassType: oOut.GatePassType || "RGP",
						ItemNo: String((index + 1) * 10).padStart(5, '0'),
						Material: it.material || "",
						MaterialDesc: it.materialName || "",
						HSNCode: it.hsnCode || "",
						HSNDesc: it.hsnDesc || "",
						UOM: it.uom || "EA",
						ItemNetPrice: fRate.toFixed(2),
						RequestedQuantity: fQty.toFixed(3),
						Totalvalue: fValue.toFixed(2),
						Remarks: it.remarks || ""
					};
				})
			};

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/GatePassReqHdrSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var sReqNo = oData.GatePassReqNo || oOut.GatePassreqNo;
					MessageBox.success("Gate Pass Request " + sReqNo + " has been successfully re-submitted and sent for approval to HOD & Stores!", {
						onClose: function () {
							this._resetModel();
							this.getRouter().navTo("home");
						}.bind(this)
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error re-submitting Gate Pass Request.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = (oResp.error && oResp.error.message && oResp.error.message.value) || sMsg;
					} catch (e) { }
					MessageBox.error(sMsg);
				}
			});
		},

		onSubmitOutgate: function () {
			var oOutModel = this.getView().getModel("out");
			var sApprovalStatus = oOutModel.getProperty("/ApprovalStatus") || "";

			// Amendment resubmission is allowed for any user role
			if (sApprovalStatus === "AMENDMENT") {
				this._resubmitAmendmentRequest();
				return;
			}

			// Gate pass generation is restricted to Store users only
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			if (!bIsStoreUser) {
				sap.m.MessageBox.error("Only Store users (ZC_MM_GATEPASS_STORE_FRONTVIEW) are authorized to generate a Gate Pass.");
				return;
			}

			var oOut = oOutModel.getData();

			var fnFormatDate = function (oDate) {
				if (!oDate) return "";
				if (typeof oDate === "string" && oDate.length === 8 && !isNaN(oDate)) { return oDate; }
				var d = new Date(oDate);
				if (isNaN(d.getTime())) return "";
				return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
			};

			// Format today's date as YYYY-MM-DD
			var sToday = new Date().toISOString().split('T')[0];

			// Format Challan Date if exists, else today
			var sChallanDate = fnFormatDate(oOut.ChallanDate) || fnFormatDate(sToday);

			var oPayload = {
				GatePassreqNo: oOut.GatePassreqNo || "",
				FiscalYear: oOut.FiscalYear || String(new Date().getFullYear()),
				Plant: oOut.Plant || "",
				GatePassType: oOut.GatePassType || "RGP",
				GatePassNo: oOut.GatePassNo || "",
				Vendor: oOut.Vendor || "",
				VendorName: oOut.VendorName,
				VendorGST: oOut.VendorGST,
				VendorPerson: oOut.VendorPerson,
				ZipCode: oOut.ZipCode || "",
				City: oOut.City || "",
				GatePassDate: sToday,
				// PurchasingDoc: oOut.PurchasingDoc || "",
				ChallanDate: sChallanDate,
				CommonDesc: oOut.CommonDesc || "",
				NoOfPacakages: parseInt(oOut.NoOfPackages || 0),
				Department: oOut.Department,
				Challanumber: oOut.ChallanNumber || "",
				GenerateDC: oOut.ChallanNumber ? "X" : "",
				VehicleNo: oOut.VehicleNo,
				ModeOfDispatch: oOut.ModeOfTransport,
				Remarks: oOut.UserRemarks,
				GPStatus: oOut.Status || "",
				TransporterName: oOut.TransporterName || "",
				TransporterGST: oOut.TransporterGST || "",
				DCNotes: oOut.DCNotes || "",
				InsuranceReq: oOut.InsuranceRequired ? "X" : "",
				InsuranceDate: oOut.InsuranceDate || "",
				InsuranceAmount: String(oOut.InsuranceAmount || "0"),
				Message: "",

				"OutgateNav": (oOut.items || []).map(function (it, index) {
					return {
						GatePassType: oOut.GatePassType || "RGP",
						GatePassNo: oOut.GatePassNo || "",
						ItemNo: String((index + 1) * 10).padStart(5, '0'),
						Material: it.material || "",
						MaterialDesc: it.materialName || it.hsnDesc || "",
						HSNCode: it.hsnCode || "",
						HSNDesc: it.hsnDesc || "",
						UOM: it.uom || "",
						ItemNetPrice: String(parseFloat(it.rate || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.sentQty || 0).toFixed(3)),
						RecievedQuantity: String(parseFloat(it.recvdQty || 0).toFixed(3)),
						BalanceQuantity: String(parseFloat(it.balQty || 0).toFixed(3)),
						Totalvalue: String(parseFloat(it.amount || 0).toFixed(2)),
						GatePassReqNo: oOut.GatePassreqNo || "",
						Remarks: it.itemRemarks || ""
					};
				})
			};

			var oODataModel = this.getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected. Please contact your administrator.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					
					// Backend might return 201 Created but actually fail/reject with a Message
					if (!oData.GatePassNo && oData.Message) {
						MessageBox.error(oData.Message);
						return;
					}

					var sGPNo = oData.GatePassNo || "Generated";

					// Update model with generated GP No and show logistics
					var oOutModel = this.getView().getModel("out");
					oOutModel.setProperty("/GatePassNo", sGPNo);
					oOutModel.setProperty("/showLogistics", true);

					var sMsg = "Gate Pass " + sGPNo + " generated successfully!\n\nThe Logistics & Printing section is now active below.";
					
					MessageBox.success(sMsg, {
						actions: [MessageBox.Action.OK, "Copy GP Number"],
						emphasizedAction: MessageBox.Action.OK,
						onClose: function (sAction) {
							if (sAction === "Copy GP Number") {
								navigator.clipboard.writeText(sGPNo).then(function() {
									sap.m.MessageToast.show("Gate Pass Number " + sGPNo + " copied!");
								});
							}
						}
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error generating Gate Pass. Please check backend.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) { }
					MessageBox.error(sMsg);
				}
			});
		},

		onSaveLogistics: function (bIsGenerateDC) {
			var oOutModel = this.getView().getModel("out");
			var oOut = oOutModel.getData();
			var oODataModel = this.getModel();
			var that = this;

			if (!oOut.GatePassNo) {
				MessageBox.warning("Generate the Gate Pass first before saving logistics.");
				return;
			}

			var fnFormatDate = function (oDate) {
				if (!oDate) return "";
				if (typeof oDate === "string" && oDate.length === 8 && !isNaN(oDate)) { return oDate; }
				var d = new Date(oDate);
				if (isNaN(d.getTime())) return "";
				return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
			};

			sap.ui.core.BusyIndicator.show(0);

			// Save logistics/transporter details locally to prevent OData validation errors
			if (oOut.GatePassNo) {
				var oLogistics = {
					LRNnumber: oOut.LRNnumber || "",
					VehicleNo: oOut.VehicleNo || "",
					ModeOfTransport: oOut.ModeOfTransport || "",
					TransporterName: oOut.TransporterName || "",
					TransporterGST: oOut.TransporterGST || "",
					EWayBillNo: oOut.EWayBillNo || "",
					EWayBillDate: oOut.EWayBillDate || "",
					ChallanNumber: oOut.ChallanNumber || "",
					DCNotes: oOut.DCNotes || "",
					GPStatus: oOut.Status || "",
					VendorPerson: oOut.VendorPerson || "",
					CommonDesc: oOut.CommonDesc || ""
				};
				console.log("[GPMS Debug] onSaveLogistics: saving logistics =", oLogistics, "GPNo =", oOut.GatePassNo, "ReqNo =", oOut.GatePassreqNo);
				localStorage.setItem("logistics_" + String(oOut.GatePassNo).trim(), JSON.stringify(oLogistics));
				if (oOut.GatePassreqNo) {
					localStorage.setItem("logistics_" + String(oOut.GatePassreqNo).trim(), JSON.stringify(oLogistics));
				}
			}

			var sToday = fnFormatDate(new Date());
			var oPayload = {
				GatePassreqNo: oOut.GatePassreqNo || "",
				FiscalYear: oOut.FiscalYear || String(new Date().getFullYear()),
				Plant: oOut.Plant || "",
				GatePassNo: oOut.GatePassNo || "",
				Vendor: oOut.Vendor || "",
				VendorName: oOut.VendorName || "",
				VendorGST: oOut.VendorGST || "",
				VendorPerson: oOut.VendorPerson || "",
				ZipCode: oOut.ZipCode || "",
				City: oOut.City || "",
				GatePassDate: sToday,
				// PurchasingDoc: oOut.PurchasingDoc || "",
				ChallanDate: fnFormatDate(oOut.ChallanDate) || sToday,
				ReturnableDate: fnFormatDate(oOut.ReturnableDate) || "",
				ExtReturnDate: fnFormatDate(oOut.ExtendedReturnableDate) || "",
				CommonDesc: oOut.CommonDesc || "",
				NoOfPacakages: parseInt(oOut.NoOfPackages || 0),
				Department: oOut.Department || "",
				Challanumber: bIsGenerateDC === true ? "" : (oOut.ChallanNumber || ""),
				GenerateDC: bIsGenerateDC === true ? "X" : (oOut.ChallanNumber ? "X" : ""),
				GatePassType: oOut.GatePassType || "RGP",
				VehicleNo: oOut.VehicleNo || "",
				ModeOfDispatch: oOut.ModeOfTransport || "",
				Remarks: oOut.UserRemarks || "",
				GPStatus: oOut.Status || "",
				Message: "",
				GPbase64: "",
				DCbase64: "",
				LRNumber: oOut.LRNnumber || "",
				TransporterName: oOut.TransporterName || "",
				TransporterGST: oOut.TransporterGST || "",
				Comment1: "", Comment2: "", Comment3: "", Comment4: "", Comment5: "",
				Comment6: "", Comment7: "", Comment8: "", Comment9: "", Comment10: "",
				Sno1: "", Sno2: "", Sno3: "", Sno4: "", Sno5: "",
				Sno6: "", Sno7: "", Sno8: "", Sno9: "", Sno10: "",
				cdate1: "", cdate2: "", cdate3: "", cdate4: "", cdate5: "",
				cdate6: "", cdate7: "", cdate8: "", cdate9: "", cdate10: "",
				DCNotes: oOut.DCNotes || "",
				InsuranceReq: oOut.InsuranceRequired ? "X" : "",
				InsuranceDate: oOut.InsuranceDate || "",
				InsuranceAmount: String(oOut.InsuranceAmount || "0"),
				OutgateNav: (oOut.items || []).map(function (it, index) {
					return {
						GatePassType: oOut.GatePassType || "RGP",
						GatePassNo: oOut.GatePassNo || "",
						ItemNo: String((index + 1) * 10).padStart(5, "0"),
						Material: it.material || "",
						MaterialDesc: it.materialName || it.hsnDesc || "",
						HSNCode: it.hsnCode || "",
						HSNDesc: it.hsnDesc || "",
						UOM: it.uom || "",
						ItemNetPrice: String(parseFloat(it.rate || 0).toFixed(2)),
						SentQuantity: String(parseFloat(it.sentQty || 0).toFixed(3)),
						RecievedQuantity: String(parseFloat(it.recvdQty || 0).toFixed(3)),
						BalanceQuantity: String(parseFloat(it.balQty || 0).toFixed(3)),
						Totalvalue: String(parseFloat(it.amount || 0).toFixed(2)),
						GatePassReqNo: oOut.GatePassreqNo || "",
						Remarks: it.itemRemarks || ""
					};
				})
			};

			// Populate flat comment fields from CommentsList
			var aOutComments = oOut.CommentsList || [];
			for (var oci = 0; oci < 10; oci++) {
				var oOutC = aOutComments[oci];
				var oIdx = oci + 1;
				var sRawDate = oOutC ? (oOutC.date || "") : "";
				var sParts = sRawDate.split("-");
				var sFmtDate = (sParts.length === 3 && sParts[2].length === 4)
					? (sParts[2] + sParts[1] + sParts[0])
					: fnFormatDate(sRawDate);
				oPayload["Comment" + oIdx] = oOutC ? (oOutC.text || "") : "";
				oPayload["Sno"     + oIdx] = oOutC ? (oOutC.sno  || String(oIdx)) : "";
				oPayload["cdate"   + oIdx] = sFmtDate || "";
			}

			oODataModel.create("/OutGatePassSet", oPayload, {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					
					var sDC = oData.Challanumber || oData.ChallanNumber;
					if (sDC) {
						oOutModel.setProperty("/ChallanNumber", sDC);
						oOutModel.setProperty("/DocOptionIndex", 1);
					}
					
					var sMsg = oData.Message || "Logistics details saved successfully!";
					MessageBox.success(sMsg);

					if (bIsGenerateDC === true && sDC) {
						that.onGenerateDC(false, true);
					}
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "Error saving logistics details.";
					try {
						var oResp = JSON.parse(oError.responseText);
						sMsg = oResp.error.message.value;
					} catch (e) { }
					MessageBox.error(sMsg);
				}
			});
		},

		onCancelGatePass: function () {
			var oOutModel = this.getView().getModel("out");
			var sGPNo = oOutModel.getProperty("/GatePassNo");
			if (!sGPNo) {
				MessageBox.warning("No Gate Pass has been generated yet.");
				return;
			}

			MessageBox.confirm("Are you sure you want to cancel Gate Pass " + sGPNo + "?", {
				actions: [MessageBox.Action.YES, MessageBox.Action.NO],
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.YES) {
						oOutModel.setProperty("/Status", "CANCELLED");
						this.onSaveLogistics();
					}
				}.bind(this)
			});
		},

		_getQRCodeBase64: function (sText) {
			return new Promise(function (resolve, reject) {
				try {
					var container = document.createElement("div");
					var qrcode = new QRCode(container, {
						text: sText,
						width: 256,
						height: 256
					});
					// Wait for it to render
					setTimeout(function () {
						var canvas = container.querySelector("canvas");
						if (canvas) {
							resolve(canvas.toDataURL("image/png"));
						} else {
							var img = container.querySelector("img");
							if (img && img.src) {
								resolve(img.src);
							} else {
								reject("Canvas not found");
							}
						}
					}, 100);
				} catch (e) {
					reject(e);
				}
			});
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
	});
});
